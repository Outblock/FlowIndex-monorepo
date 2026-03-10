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

        // Extract raw values in template-defined order
        const orderedArgs = template.args.map((argDef) => {
          const val = args[argDef.name];
          if (val === undefined) {
            throw new Error(`Missing required argument: ${argDef.name}`);
          }
          return val;
        });

        // Check if approval is needed
        if (ctx.config.approvalRequired && ctx.signer.isHeadless()) {
          const txId = randomUUID();
          const summary = `${template_name}(${template.args.map((a) => `${a.name}=${JSON.stringify(args[a.name])}`).join(', ')})`;
          addPendingTx(txId, {
            template_name,
            cadence: template.cadence,
            args,
            summary,
            createdAt: Date.now(),
          });
          return jsonContent({
            status: 'pending_approval',
            tx_id: txId,
            summary,
            message: 'Transaction queued for approval. Use the approve_transaction tool to sign and submit.',
          });
        }

        // Execute immediately via codegen service
        const result = await executeTransaction(ctx.cadenceService, template_name, orderedArgs);
        return jsonContent(result);
      } catch (error) {
        return jsonContent({ error: String(error) }, true);
      }
    },
  );
}
