/**
 * Configures the generated CadenceService with FCL network settings
 * and injects the wallet signer via request interceptor.
 */
import * as fcl from '@onflow/fcl';
import { CadenceService } from './cadence.gen.js';
import { NETWORK_CONFIG, type FlowNetwork } from '../config/networks.js';
import type { FlowSigner } from '../signer/interface.js';

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

export function createCadenceService(
  network: FlowNetwork,
  signer: FlowSigner,
): CadenceService {
  const config = NETWORK_CONFIG[network];

  // Configure FCL
  fcl.config()
    .put('accessNode.api', config.accessNode)
    .put('flow.network', network);

  for (const [name, address] of Object.entries(config.contracts)) {
    fcl.config().put(`0x${name}`, address);
  }

  const service = new CadenceService();

  const VERSION = '0.1.6';

  // Add version header to transaction Cadence scripts
  service.useRequestInterceptor((cfg: Record<string, unknown>) => {
    if (cfg.type === 'transaction' && typeof cfg.cadence === 'string') {
      const header = `// FlowIndex Agent Wallet - v${VERSION} - ${network}`;
      cfg.cadence = header + '\n\n' + cfg.cadence;
    }
    return cfg;
  });

  // Inject signer into all transaction configs
  service.useRequestInterceptor((cfg: Record<string, unknown>) => {
    if (cfg.type === 'transaction') {
      const info = signer.info();
      const address = info.flowAddress;
      if (!address) throw new Error('Signer has no Flow address configured');

      const keyIndex = info.keyIndex;
      const sigAlgo = sigAlgoCode(info.sigAlgo);
      const hashAlgo = hashAlgoCode(info.hashAlgo);

      const addrNoPrefix = fcl.sansPrefix(address);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authz = (account: any) => ({
        ...account,
        kind: 'ACCOUNT',
        tempId: `${addrNoPrefix}-${keyIndex}`,
        addr: addrNoPrefix,
        keyId: keyIndex,
        signingFunction: async (signable: { message: string }) => {
          console.error(`[signer] signing message (${signable.message.length} hex chars): ${signable.message.slice(0, 32)}...`);
          const result = await signer.signFlowTransaction(signable.message);
          console.error(`[signer] signature: ${result.signature.slice(0, 32)}...`);
          return {
            f_type: 'CompositeSignature',
            f_vsn: '1.0.0',
            addr: addrNoPrefix,
            keyId: keyIndex,
            signature: result.signature,
          };
        },
        sigAlgo,
        hashAlgo,
      });

      return {
        ...cfg,
        proposer: authz,
        payer: authz,
        authorizations: [authz],
        limit: 9999,
      };
    }
    return cfg;
  });

  return service;
}
