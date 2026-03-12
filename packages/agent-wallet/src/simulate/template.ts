import type { AgentWalletConfig } from '../config/env.js';
import {
  FlowIndexClient,
  type JsonCdcValue,
  type SimulateTransactionRequest,
  type SimulateTransactionResponse,
  type SimulatorScheduledOptions,
} from '../flowindex/client.js';
import type { FlowSigner } from '../signer/interface.js';
import type { Template } from '../templates/registry.js';

const INTEGER_TYPES = new Set([
  'Int',
  'Int8',
  'Int16',
  'Int32',
  'Int64',
  'Int128',
  'Int256',
  'UInt',
  'UInt8',
  'UInt16',
  'UInt32',
  'UInt64',
  'UInt128',
  'UInt256',
]);

const FIXED_POINT_TYPES = new Set(['Fix64', 'UFix64']);

export interface PreflightSimulationResult {
  simulation?: SimulateTransactionResponse;
  skippedReason?: string;
  error?: string;
}

function normalizeType(type: string): string {
  return type.replace(/\s+/g, '');
}

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function parseArrayValue(type: string, value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value instanceof Uint8Array) return Array.from(value);
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return Array.from(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to the generic error below.
    }
  }
  throw new Error(`Expected ${type} argument to be an array or JSON array string`);
}

export function toJsonCdcValue(type: string, value: unknown): JsonCdcValue {
  const normalizedType = normalizeType(type);

  if (normalizedType.startsWith('[') && normalizedType.endsWith(']')) {
    const innerType = normalizedType.slice(1, -1);
    const items = parseArrayValue(normalizedType, value);
    return {
      type: 'Array',
      value: items.map((item) => toJsonCdcValue(innerType, item)),
    };
  }

  if (normalizedType === 'Address') {
    return { type: normalizedType, value: normalizeAddress(String(value)) };
  }

  if (normalizedType === 'String') {
    return { type: normalizedType, value: String(value) };
  }

  if (normalizedType === 'Bool') {
    if (typeof value === 'boolean') {
      return { type: normalizedType, value };
    }
    if (typeof value === 'string') {
      const lowered = value.trim().toLowerCase();
      if (lowered === 'true' || lowered === 'false') {
        return { type: normalizedType, value: lowered === 'true' };
      }
    }
    throw new Error('Bool arguments must be true or false');
  }

  if (INTEGER_TYPES.has(normalizedType) || FIXED_POINT_TYPES.has(normalizedType)) {
    return { type: normalizedType, value: String(value) };
  }

  throw new Error(`Unsupported Cadence argument type for simulation: ${type}`);
}

function resolveSimulationAddress(
  config: AgentWalletConfig,
  signer: FlowSigner,
): { address?: string; reason?: string } {
  if (!config.flowSimulatorEnabled) {
    return {
      reason: 'Preflight simulation is disabled via FLOW_SIMULATOR_ENABLED=false.',
    };
  }

  if (config.network !== 'mainnet') {
    return {
      reason:
        'Transaction simulation is currently only available on mainnet because the public simulator runs against a mainnet fork.',
    };
  }

  const address = signer.info().flowAddress ?? config.flowAddress;
  if (!address) {
    return {
      reason: 'Current signer has no Flow address configured, so the transaction cannot be simulated.',
    };
  }

  return { address: normalizeAddress(address) };
}

export function buildTemplateSimulationRequest(
  template: Template,
  args: Record<string, unknown>,
  authorizer: string,
  scheduled?: SimulatorScheduledOptions,
): SimulateTransactionRequest {
  const orderedArgs = template.args.map((argDef) => {
    const rawValue = args[argDef.name];
    if (rawValue === undefined) {
      throw new Error(`Missing required argument: ${argDef.name}`);
    }
    return toJsonCdcValue(argDef.type, rawValue);
  });

  const request: SimulateTransactionRequest = {
    cadence: template.cadence,
    arguments: orderedArgs,
    authorizers: [authorizer],
    payer: authorizer,
  };

  if (scheduled && ((scheduled.advance_seconds ?? 0) > 0 || (scheduled.advance_blocks ?? 0) > 0)) {
    request.scheduled = scheduled;
  }

  return request;
}

export async function maybeSimulateTemplate(
  config: AgentWalletConfig,
  signer: FlowSigner,
  template: Template,
  args: Record<string, unknown>,
  scheduled?: SimulatorScheduledOptions,
): Promise<PreflightSimulationResult> {
  const support = resolveSimulationAddress(config, signer);
  if (!support.address) {
    return { skippedReason: support.reason };
  }

  try {
    const client = new FlowIndexClient(
      config.flowindexUrl,
      config.flowSimulatorUrl,
    );
    const request = buildTemplateSimulationRequest(
      template,
      args,
      support.address,
      scheduled,
    );
    const simulation = await client.simulateTransaction(request);
    return { simulation };
  } catch (error) {
    return { error: String(error) };
  }
}
