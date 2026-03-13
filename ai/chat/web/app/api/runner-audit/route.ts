import { createMCPClient } from "@ai-sdk/mcp";
import { anthropic, type AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import {
  Output,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";

const CADENCE_MCP_URL =
  process.env.CADENCE_MCP_URL || "https://cadence-mcp.up.railway.app/mcp";
const CADENCE_MCP_BASE =
  process.env.CADENCE_MCP_BASE_URL || "https://cadence-mcp.up.railway.app";

const auditFindingSchema = z.object({
  severity: z.enum(["high", "medium", "low", "info", "error", "warning"]),
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  column: z.number().int().min(1).optional(),
  endColumn: z.number().int().min(1).optional(),
  rule: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1),
  suggestion: z.string().trim().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["security", "typecheck", "best-practice", "ai-review"]),
});

const auditResultSchema = z.object({
  findings: z.array(auditFindingSchema),
  summary: z.string().trim().default(""),
  score: z.enum(["A", "B", "C", "D", "F"]).optional(),
});

type AuditResult = z.infer<typeof auditResultSchema>;

function extractAuditResultFromText(text: string): AuditResult | null {
  const jsonMatch =
    text.match(/```json\s*([\s\S]*?)```/) ||
    text.match(/(\{[\s\S]*"findings"[\s\S]*\})/);
  if (!jsonMatch) return null;

  try {
    return auditResultSchema.parse(JSON.parse(jsonMatch[1].trim()));
  } catch (error) {
    console.warn("[runner-audit] fallback parse failed:", error);
    return null;
  }
}

// Pre-fetch security scan + type check via REST (milliseconds, skips Claude tool-call overhead)
async function prefetchScan(
  code: string,
  network: string,
): Promise<{ scan: string; diagnostics: string }> {
  try {
    const res = await fetch(`${CADENCE_MCP_BASE}/api/security-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, network }),
    });
    if (!res.ok) {
      console.error(`[runner-audit] security-scan HTTP ${res.status}`);
      return { scan: "Security scan unavailable", diagnostics: "Type check unavailable" };
    }
    const data = await res.json();
    const scanFindings = data.scan?.findings ?? [];
    const scanSummary = data.scan?.summary ?? {};
    const scanText = scanFindings.length > 0
      ? `Found ${scanFindings.length} issue(s): ${scanSummary.high ?? 0} high, ${scanSummary.medium ?? 0} medium, ${scanSummary.low ?? 0} low, ${scanSummary.info ?? 0} info\n\n${scanFindings
          .map((f: any) => `- [${(f.severity || "info").toUpperCase()}] Line ${f.line}: (${f.rule || "unknown"}) ${f.message}`)
          .join("\n")}`
      : "No security issues found.";
    const diagText = data.diagnostics || "No type errors found.";
    return { scan: scanText, diagnostics: diagText };
  } catch (e) {
    console.error("[runner-audit] prefetch failed:", e);
    return { scan: "Security scan unavailable", diagnostics: "Type check unavailable" };
  }
}

// Connect to MCP for non-scan tools (search_docs, get_doc, cadence_hover, etc.)
async function safeMcpTools(
  url: string
): Promise<{
  tools: Record<string, any>;
  client: Awaited<ReturnType<typeof createMCPClient>> | null;
}> {
  try {
    const client = await createMCPClient({ transport: { type: "http", url } });
    const allTools = await client.tools();
    // Exclude scan tools — those are pre-fetched via REST
    const { cadence_security_scan, cadence_check, ...tools } = allTools;
    return { tools, client };
  } catch (e) {
    console.error(`[runner-audit] MCP connection failed (${url}):`, e);
    return { tools: {}, client: null };
  }
}

const AUDIT_SYSTEM_PROMPT = `You are a Cadence smart contract security auditor for deployed contracts on the Flow blockchain.

## Your Task

Analyze the contract code and the pre-fetched scan results below. The security scan and type check have ALREADY been run — do NOT call cadence_security_scan or cadence_check.

You may optionally use these MCP tools if helpful:
- \`search_docs\` / \`get_doc\` — look up Cadence best practices
- \`cadence_hover\` — get type info for specific symbols
- \`cadence_definition\` — find symbol definitions

## Output Format

Return a single JSON object that matches the provided schema exactly.

Each finding must include:
- \`startLine\` and \`endLine\` (inclusive). Use the same value for single-line findings.
- \`confidence\` between 0 and 1 when you have a meaningful confidence estimate.
- \`source\` set to one of: \`security\`, \`typecheck\`, \`best-practice\`, \`ai-review\`.

## Severity Guidelines

- **high**: Exploitable vulnerabilities, resource loss, unauthorized access, capability leaks
- **error**: Definite correctness or type failures that break expected contract behavior
- **medium**: Access control issues, missing checks, unsafe patterns (force-unwrap, etc.)
- **warning**: Risky patterns that should be fixed soon but are not clearly exploitable
- **low**: Code quality issues, non-standard patterns
- **info**: Style suggestions, naming conventions

## Important Notes

- Every finding MUST have a valid line range.
- Include findings from the automated scan AND your own manual review.
- Deduplicate — if the scan and your review find the same issue, report it once.
- If the contract looks clean, say so honestly. Don't invent issues.
- Return JSON only. No markdown fences or prose.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  const {
    messages,
    code,
    contractName,
    network,
  }: {
    messages: UIMessage[];
    code?: string;
    contractName?: string;
    network?: string;
  } = await req.json();

  const net = network || "mainnet";

  // Pre-fetch scan results via REST (milliseconds) + connect MCP for other tools (in parallel)
  const [{ scan, diagnostics }, cadenceMcp] = await Promise.all([
    prefetchScan(code || "", net),
    safeMcpTools(CADENCE_MCP_URL),
  ]);

  const systemWithContext = `${AUDIT_SYSTEM_PROMPT}

## Contract to Audit

Contract: ${contractName || "Unknown"}
Network: ${net}

\`\`\`cadence
${code || "// No code provided"}
\`\`\`

## Security Scan Results (pre-fetched)

${scan}

## Type Check Results (pre-fetched)

${diagnostics}`;

  const result = streamText({
    model: anthropic("claude-opus-4-6"),
    output: Output.object({
      schema: auditResultSchema,
      name: "audit_result",
      description: "Structured Cadence audit findings, summary, and score.",
    }),
    providerOptions: {
      anthropic: {
        structuredOutputMode: "jsonTool",
        contextManagement: {
          edits: [
            {
              type: "compact_20260112" as const,
              trigger: { type: "input_tokens" as const, value: 150_000 },
              instructions:
                "Summarize the audit conversation. Preserve: security findings, " +
                "severity levels, and remediation suggestions.",
            },
          ],
        },
        thinking: { type: "enabled", budgetTokens: 16000 },
      } satisfies AnthropicLanguageModelOptions,
    },
    system: systemWithContext,
    messages: await convertToModelMessages(messages),
    tools: cadenceMcp.tools,
    stopWhen: stepCountIs(8),
    onFinish: async () => {
      await cadenceMcp.client?.close();
    },
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.merge(result.toUIMessageStream());

      let auditResult: AuditResult | null = null;
      try {
        auditResult = await result.output;
      } catch (error) {
        console.warn("[runner-audit] structured output unavailable, falling back to text parse:", error);
        try {
          const fallbackText = await result.text;
          auditResult = fallbackText ? extractAuditResultFromText(fallbackText) : null;
        } catch (fallbackError) {
          console.warn("[runner-audit] fallback text unavailable:", fallbackError);
        }
      }

      if (auditResult) {
        writer.write({
          type: "data-audit-result",
          id: crypto.randomUUID(),
          data: auditResult,
        } as any);
      }
    },
    onError: (error) => {
      console.error("[runner-audit] stream error:", error);
      return "Audit stream failed";
    },
  });

  return createUIMessageStreamResponse({ headers: CORS_HEADERS, stream });
}
