import { PasskeySigner as BasePasskeySigner } from '@flowindex/flow-signer';
import type { AgentWalletConfig } from '../config/env.js';

// Re-export the PendingTxMeta type so existing consumers still work
export type { PendingTxMeta } from '@flowindex/flow-signer';

/**
 * Agent-wallet wrapper around flow-signer's PasskeySigner.
 * Accepts AgentWalletConfig and adapts it to SignerConfig + options.
 */
export class PasskeySigner extends BasePasskeySigner {
  constructor(config: AgentWalletConfig) {
    super(
      { flowindexUrl: config.flowindexUrl, network: config.network },
      {
        flowAddress: config.flowAddress,
        keyIndex: config.flowKeyIndex,
        token: config.flowindexToken,
      },
    );
  }
}
