import { CloudSigner as BaseCloudSigner } from '@flowindex/flow-signer';
import type { AgentWalletConfig } from '../config/env.js';

/**
 * Agent-wallet wrapper around flow-signer's CloudSigner.
 * Accepts AgentWalletConfig and adapts it to SignerConfig + token.
 */
export class CloudSigner extends BaseCloudSigner {
  constructor(config: AgentWalletConfig) {
    super(
      { flowindexUrl: config.flowindexUrl, network: config.network },
      config.flowindexToken,
    );
  }
}
