/**
 * MCP tools for Cadence template listing, inspection, and execution.
 * Uses cadence-codegen generated CadenceService for type-safe FCL calls.
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerContext } from '../server/server.js';
import { getTemplate, listTemplates } from '../templates/registry.js';
import { addPendingTx } from '../approval/manager.js';
import type { CadenceService } from '../templates/cadence.gen.js';
import type { SimulateTransactionResponse } from '../flowindex/client.js';
import { maybeSimulateTemplate } from '../simulate/template.js';
import * as fcl from '@onflow/fcl';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonContent(data: unknown, isError = false) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function summarizeTemplateInvocation(
  templateName: string,
  args: Record<string, unknown>,
  orderedArgNames: string[],
): string {
  return `${templateName}(${orderedArgNames.map((name) => `${name}=${JSON.stringify(args[name])}`).join(', ')})`;
}

function buildOrderedArgs(
  args: Record<string, unknown> | undefined,
  orderedArgNames: string[],
): unknown[] {
  return orderedArgNames.map((name) => {
    const val = args?.[name];
    if (val === undefined) {
      throw new Error(`Missing required argument: ${name}`);
    }
    return val;
  });
}

function withPreflightSimulation<T extends object>(
  payload: T,
  preflight: {
    simulation?: SimulateTransactionResponse;
    skippedReason?: string;
    error?: string;
  },
): T & {
  preflight_simulation?: SimulateTransactionResponse;
  preflight_simulation_skipped_reason?: string;
  preflight_simulation_error?: string;
} {
  return {
    ...payload,
    ...(preflight.simulation ? { preflight_simulation: preflight.simulation } : {}),
    ...(preflight.skippedReason
      ? { preflight_simulation_skipped_reason: preflight.skippedReason }
      : {}),
    ...(preflight.error ? { preflight_simulation_error: preflight.error } : {}),
  };
}

/**
 * Convert snake_case template name to camelCase method name on CadenceService.
 * e.g. "create_coa" -> "createCoa", "transfer_tokens_v3" -> "transferTokensV3"
 */
function toCamelCase(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

/**
 * Execute a generated CadenceService method by template name.
 * For transactions, the service's request interceptor injects the signer.
 * Returns the tx ID (for transactions) or result (for scripts).
 */
export async function executeViaCodegen(
  service: CadenceService,
  templateName: string,
  orderedArgs: unknown[],
): Promise<unknown> {
  const methodName = toCamelCase(templateName);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const method = (service as any)[methodName];
  if (typeof method !== 'function') {
    throw new Error(`No generated method found for template "${templateName}" (tried "${methodName}")`);
  }
  return method.call(service, ...orderedArgs);
}

/**
 * Execute a generated CadenceService transaction, wait for seal, return result.
 */
export async function executeTransaction(
  service: CadenceService,
  templateName: string,
  orderedArgs: unknown[],
): Promise<TxResult> {
  const txId = await executeViaCodegen(service, templateName, orderedArgs) as string;

  // Wait for seal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sealed: any = await fcl.tx(txId).onceSealed();

  return {
    status: 'sealed',
    tx_id: txId,
    block_height: (sealed.blockHeight ?? sealed.block_height ?? 0) as number,
    events: (sealed.events ?? []).map((e: { type: string; data: unknown }) => ({
      type: e.type,
      data: e.data,
    })),
  };
}

export interface TxResult {
  status: 'sealed';
  tx_id: string;
  block_height: number;
  events: Array<{ type: string; data: unknown }>;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerTemplateTools(server: McpServer, ctx: ServerContext): void {
  // -------------------------------------------------------------------------
  // list_templates
  // -------------------------------------------------------------------------
  server.registerTool(
    'list_templates',
    {
      title: 'List Cadence Templates',
      description:
        'List available Cadence transaction and script templates. Optionally filter by category (base, token, collection, evm, bridge, hybrid-custody, lost-and-found).',
      inputSchema: {
        category: z.string().optional().describe('Filter by category name'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ category }: { category?: string }) => {
      try {
        const templates = listTemplates(category);
        const summaries = templates.map((t) => ({
          name: t.name,
          category: t.category,
          type: t.type,
          description: t.description,
          arg_count: t.args.length,
        }));
        return jsonContent(summaries);
      } catch (error) {
        return jsonContent({ error: String(error) }, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_template
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_template',
    {
      title: 'Get Cadence Template',
      description:
        'Retrieve the full Cadence source code and argument schema for a named template.',
      inputSchema: {
        name: z.string().describe('Template name (e.g. "transfer_tokens_v3")'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name }: { name: string }) => {
      try {
        const template = getTemplate(name);
        if (!template) {
          return jsonContent({ error: `Template "${name}" not found` }, true);
        }
        return jsonContent(template);
      } catch (error) {
        return jsonContent({ error: String(error) }, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // execute_script
  // -------------------------------------------------------------------------
  server.registerTool(
    'execute_script',
    {
      title: 'Execute Cadence Script',
      description:
        'Execute a read-only Cadence script on the Flow network. Provide a template_name to use a generated script.',
      inputSchema: {
        template_name: z.string().describe('Name of a script template to use'),
        args: z.record(z.any()).optional().describe('Named arguments matching the template arg schema'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ template_name, args }: { template_name: string; args?: Record<string, unknown> }) => {
      try {
        const template = getTemplate(template_name);
        if (!template) return jsonContent({ error: `Template "${template_name}" not found` }, true);
        if (template.type !== 'script') return jsonContent({ error: `Template "${template_name}" is a transaction, not a script` }, true);

        const orderedArgs = template.args.map((a) => {
          const val = args?.[a.name];
          if (val === undefined) throw new Error(`Missing required argument: ${a.name}`);
          return val;
        });

        const result = await executeViaCodegen(ctx.cadenceService, template_name, orderedArgs);
        return jsonContent({ result });
      } catch (error) {
        return jsonContent({ error: String(error) }, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // simulate_template
  // -------------------------------------------------------------------------
  server.registerTool(
    'simulate_template',
    {
      title: 'Simulate Cadence Transaction Template',
      description:
        'Run a preflight simulation for a Cadence transaction template on the public FlowIndex simulator. This is mainnet-only and does not sign or submit anything.',
      inputSchema: {
        template_name: z.string().describe('Name of the transaction template to simulate'),
        args: z.record(z.any()).describe('Named arguments matching the template arg schema'),
        scheduled: z
          .object({
            advance_seconds: z.number().min(0).max(5).optional(),
            advance_blocks: z.number().int().min(0).max(20).optional(),
          })
          .optional()
          .describe('Optional scheduled-transaction replay controls for mainnet simulation.'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      template_name,
      args,
      scheduled,
    }: {
      template_name: string;
      args: Record<string, unknown>;
      scheduled?: { advance_seconds?: number; advance_blocks?: number };
    }) => {
      try {
        const template = getTemplate(template_name);
        if (!template) {
          return jsonContent({ error: `Template "${template_name}" not found` }, true);
        }
        if (template.type !== 'transaction') {
          return jsonContent({ error: `Template "${template_name}" is a script, use execute_script instead` }, true);
        }

        const preflight = await maybeSimulateTemplate(
          ctx.config,
          ctx.signer,
          template,
          args,
          scheduled,
        );

        if (preflight.simulation) {
          return jsonContent({
            template_name,
            summary: summarizeTemplateInvocation(
              template_name,
              args,
              template.args.map((arg) => arg.name),
            ),
            simulation: preflight.simulation,
          });
        }

        const message = preflight.skippedReason ?? preflight.error ?? 'Simulation unavailable';
        return jsonContent({ error: message }, true);
      } catch (error) {
        return jsonContent({ error: String(error) }, true);
      }
    },
  );

  // -------------------------------------------------------------------------
  // execute_template
  // -------------------------------------------------------------------------
  server.registerTool(
    'execute_template',
    {
      title: 'Execute Cadence Transaction',
      description:
        'Execute a Cadence transaction template. If approval is required and the signer is headless, the transaction is queued for manual approval. Otherwise it is signed and submitted immediately.',
      inputSchema: {
        template_name: z.string().describe('Name of the transaction template to execute'),
        args: z.record(z.any()).describe('Named arguments matching the template arg schema'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ template_name, args }: { template_name: string; args: Record<string, unknown> }) => {
      try {
        const template = getTemplate(template_name);
        if (!template) {
          return jsonContent({ error: `Template "${template_name}" not found` }, true);
        }
        if (template.type !== 'transaction') {
          return jsonContent({ error: `Template "${template_name}" is a script, use execute_script instead` }, true);
        }

        const orderedArgNames = template.args.map((argDef) => argDef.name);
        const orderedArgs = buildOrderedArgs(args, orderedArgNames);
        const summary = summarizeTemplateInvocation(template_name, args, orderedArgNames);
        const preflight = await maybeSimulateTemplate(
          ctx.config,
          ctx.signer,
          template,
          args,
        );

        // Check if approval is needed
        if (ctx.config.approvalRequired && ctx.signer.isHeadless()) {
          const txId = randomUUID();
          addPendingTx(txId, {
            template_name,
            cadence: template.cadence,
            args,
            summary,
            createdAt: Date.now(),
            preflightSimulation: preflight.simulation,
            preflightSimulationSkippedReason: preflight.skippedReason,
            preflightSimulationError: preflight.error,
          });
          return jsonContent(
            withPreflightSimulation(
              {
                status: 'pending_approval',
                tx_id: txId,
                summary,
                message: 'Transaction queued for approval. Use the confirm_transaction tool to sign and submit.',
              },
              preflight,
            ),
          );
        }

        // Execute immediately via codegen service
        const result = await executeTransaction(ctx.cadenceService, template_name, orderedArgs);
        return jsonContent(withPreflightSimulation(result, preflight));
      } catch (error) {
        return jsonContent({ error: String(error) }, true);
      }
    },
  );
}
