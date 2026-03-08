import { LocalSigner as BaseLocalSigner } from '@flowindex/flow-signer';
import type { AgentWalletConfig } from '../config/env.js';

/**
 * Agent-wallet wrapper around flow-signer's LocalSigner.
 * Accepts AgentWalletConfig and adapts it to SignerConfig + LocalSignerOptions.
 */
export class LocalSigner extends BaseLocalSigner {
  constructor(config: AgentWalletConfig) {
    super(
      { flowindexUrl: config.flowindexUrl, network: config.network },
      {
        privateKey: config.privateKey,
        mnemonic: config.mnemonic,
        address: config.flowAddress,
        keyIndex: config.flowKeyIndex,
        sigAlgo: config.sigAlgo,
        hashAlgo: config.hashAlgo,
        evmPrivateKey: config.evmPrivateKey,
        evmAccountIndex: config.evmAccountIndex,
      },
    );
  }
}
