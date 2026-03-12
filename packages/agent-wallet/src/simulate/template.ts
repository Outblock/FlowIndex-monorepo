import type { AgentWalletConfig } from '../config/env.js';
import {
  FlowIndexClient,
  type SimulateTransactionRequest,
  type SimulateTransactionResponse,
  type SimulatorScheduledOptions,
} from '../flowindex/client.js';
import { normalizeAddress, toJsonCdcValue, type CadenceArgument } from '../cadence/arguments.js';
import type { FlowSigner } from '../signer/interface.js';
import type { Template } from '../templates/registry.js';

export interface PreflightSimulationResult {
  simulation?: SimulateTransactionResponse;
  skippedReason?: string;
  error?: string;
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

export function buildCadenceTransactionSimulationRequest(
  cadence: string,
  argumentsList: CadenceArgument[],
  authorizer: string,
  scheduled?: SimulatorScheduledOptions,
): SimulateTransactionRequest {
  const request: SimulateTransactionRequest = {
    cadence: cadence.trim(),
    arguments: argumentsList.map((argument) => toJsonCdcValue(argument.type, argument.value)),
    authorizers: [authorizer],
    payer: authorizer,
  };

  if (scheduled && ((scheduled.advance_seconds ?? 0) > 0 || (scheduled.advance_blocks ?? 0) > 0)) {
    request.scheduled = scheduled;
  }

  return request;
}

export function buildTemplateSimulationRequest(
  template: Template,
  args: Record<string, unknown>,
  authorizer: string,
  scheduled?: SimulatorScheduledOptions,
): SimulateTransactionRequest {
  const orderedArgs: CadenceArgument[] = template.args.map((argDef) => {
    const rawValue = args[argDef.name];
    if (rawValue === undefined) {
      throw new Error(`Missing required argument: ${argDef.name}`);
    }
    return { type: argDef.type, value: rawValue };
  });

  return buildCadenceTransactionSimulationRequest(
    template.cadence,
    orderedArgs,
    authorizer,
    scheduled,
  );
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

export async function maybeSimulateCadenceTransaction(
  config: AgentWalletConfig,
  signer: FlowSigner,
  cadence: string,
  argumentsList: CadenceArgument[],
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
    const request = buildCadenceTransactionSimulationRequest(
      cadence,
      argumentsList,
      support.address,
      scheduled,
    );
    const simulation = await client.simulateTransaction(request);
    return { simulation };
  } catch (error) {
    return { error: String(error) };
  }
}
