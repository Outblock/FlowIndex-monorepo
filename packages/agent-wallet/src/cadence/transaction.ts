import * as fcl from '@onflow/fcl';
import { buildFclArgs, type CadenceArgument } from './arguments.js';
import type { FlowSigner } from '../signer/interface.js';
import type { FlowNetwork } from '../config/networks.js';

function sigAlgoCode(algo: string): number {
  switch (algo) {
    case 'ECDSA_P256': return 2;
    case 'ECDSA_secp256k1': return 3;
    default: return 3;
  }
}

function hashAlgoCode(algo: string): number {
  switch (algo) {
    case 'SHA2_256': return 1;
    case 'SHA3_256': return 3;
    default: return 1;
  }
}

function buildAuthorization(signer: FlowSigner) {
  const info = signer.info();
  const address = info.flowAddress;
  if (!address) {
    throw new Error('Signer has no Flow address configured');
  }

  const keyIndex = info.keyIndex;
  const addrNoPrefix = fcl.sansPrefix(address);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (account: any) => ({
    ...account,
    kind: 'ACCOUNT',
    tempId: `${addrNoPrefix}-${keyIndex}`,
    addr: addrNoPrefix,
    keyId: keyIndex,
    signingFunction: async (signable: { message: string }) => {
      const result = await signer.signFlowTransaction(signable.message);
      return {
        f_type: 'CompositeSignature',
        f_vsn: '1.0.0',
        addr: addrNoPrefix,
        keyId: keyIndex,
        signature: result.signature,
      };
    },
    sigAlgo: sigAlgoCode(info.sigAlgo),
    hashAlgo: hashAlgoCode(info.hashAlgo),
  });
}

function withHeader(network: FlowNetwork, cadence: string): string {
  const version = '0.1.6';
  return `// FlowIndex Agent Wallet - v${version} - ${network}\n\n${cadence.trim()}`;
}

export interface CadenceTransactionResult {
  status: 'sealed';
  tx_id: string;
  block_height: number;
  events: Array<{ type: string; data: unknown }>;
}

export async function executeCadenceTransaction(
  cadence: string,
  argumentsList: CadenceArgument[],
  signer: FlowSigner,
  network: FlowNetwork,
): Promise<CadenceTransactionResult> {
  const authz = buildAuthorization(signer);
  const config = {
    cadence: withHeader(network, cadence),
    proposer: authz,
    payer: authz,
    authorizations: [authz],
    limit: 9999,
  };

  if (argumentsList.length > 0) {
    Object.assign(config, {
      args: buildFclArgs(argumentsList),
    });
  }

  const txId = await fcl.mutate(config as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sealed: any = await fcl.tx(txId).onceSealed();

  return {
    status: 'sealed',
    tx_id: txId,
    block_height: (sealed.blockHeight ?? sealed.block_height ?? 0) as number,
    events: (sealed.events ?? []).map((event: { type: string; data: unknown }) => ({
      type: event.type,
      data: event.data,
    })),
  };
}
