import { createMCPClient } from "@ai-sdk/mcp";
import { anthropic, type AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";

const CADENCE_MCP_URL =
  process.env.CADENCE_MCP_URL || "https://cadence-mcp.up.railway.app/mcp";
const CADENCE_MCP_BASE =
  process.env.CADENCE_MCP_BASE_URL || "https://cadence-mcp.up.railway.app";

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

After your analysis, output ONLY this JSON block. No extra text before or after.

\`\`\`json
{
  "findings": [
    {
      "severity": "high|medium|low|info",
      "line": 42,
      "column": 10,
      "rule": "rule-id",
      "message": "Clear description of the issue",
      "suggestion": "How to fix this issue",
      "source": "security|typecheck|best-practice|ai-review"
    }
  ],
  "summary": "Brief overall assessment of the contract's security posture",
  "score": "A|B|C|D|F"
}
\`\`\`

## Severity Guidelines

- **high**: Exploitable vulnerabilities, resource loss, unauthorized access, capability leaks
- **medium**: Access control issues, missing checks, unsafe patterns (force-unwrap, etc.)
- **low**: Code quality issues, non-standard patterns
- **info**: Style suggestions, naming conventions

## Important Notes

- Every finding MUST have a line number.
- Include findings from the automated scan AND your own manual review.
- Deduplicate — if the scan and your review find the same issue, report it once.
- If the contract looks clean, say so honestly. Don't invent issues.
- Output ONLY the JSON block. No prose, no explanation.`;

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
    providerOptions: {
      anthropic: {
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

  return result.toUIMessageStreamResponse({ headers: CORS_HEADERS });
}
