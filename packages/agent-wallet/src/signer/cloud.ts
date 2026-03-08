import type { FlowSigner, SignResult, SignerInfo } from './interface.js';
import type { AgentWalletConfig } from '../config/env.js';

// ---------------------------------------------------------------------------
// CloudSigner — delegates signing to FlowIndex custodial wallet API
// ---------------------------------------------------------------------------

interface WalletMeResponse {
  address: string;
  keyIndex: number;
  sigAlgo: string;
  hashAlgo: string;
  evmAddress?: string;
}

export class CloudSigner implements FlowSigner {
  private readonly config: AgentWalletConfig;
  private token?: string;

  private flowAddress?: string;
  private evmAddress?: string;
  private keyIndex = 0;
  private sigAlgo = 'ECDSA_secp256k1';
  private hashAlgo = 'SHA2_256';

  constructor(config: AgentWalletConfig) {
    this.config = config;
    this.token = config.flowindexToken;
  }

  /** Inject or replace the JWT token at runtime. */
  setToken(token: string): void {
    this.token = token;
  }

  // ---- FlowSigner implementation ------------------------------------------

  async init(): Promise<void> {
    if (!this.token) throw new Error('CloudSigner requires a FLOWINDEX_TOKEN');

    const resp = await fetch(`${this.config.flowindexUrl}/api/v1/wallet/me`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`CloudSigner init failed (${resp.status}): ${body}`);
    }

    const data = (await resp.json()) as WalletMeResponse;
    this.flowAddress = data.address;
    this.keyIndex = data.keyIndex;
    this.sigAlgo = data.sigAlgo;
    this.hashAlgo = data.hashAlgo;
    this.evmAddress = data.evmAddress;
  }

  info(): SignerInfo {
    return {
      type: 'cloud',
      flowAddress: this.flowAddress,
      evmAddress: this.evmAddress,
      keyIndex: this.keyIndex,
      sigAlgo: this.sigAlgo,
      hashAlgo: this.hashAlgo,
    };
  }

  async signFlowTransaction(messageHex: string): Promise<SignResult> {
    if (!this.token) throw new Error('CloudSigner: no token set');

    const resp = await fetch(`${this.config.flowindexUrl}/api/v1/wallet/sign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: messageHex }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`CloudSigner sign failed (${resp.status}): ${body}`);
    }

    const data = (await resp.json()) as { signature: string };
    return { signature: data.signature };
  }

  isHeadless(): boolean {
    return !!this.token;
  }

  // ---- Getters ------------------------------------------------------------

  getFlowAddress(): string | undefined {
    return this.flowAddress;
  }

  getKeyIndex(): number {
    return this.keyIndex;
  }
}
