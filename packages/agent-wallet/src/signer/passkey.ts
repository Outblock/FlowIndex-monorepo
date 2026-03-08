import type { FlowSigner, SignResult, SignerInfo } from './interface.js';
import type { AgentWalletConfig } from '../config/env.js';

// ---------------------------------------------------------------------------
// PasskeySigner — browser-based passkey approval flow (NOT headless)
//
// This is a stub implementation. The full version will:
//  1. POST to create an approval request
//  2. Poll until the user approves via passkey in the browser
//  3. Return the signature + FLIP-264 extension data
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

interface ApprovalResponse {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  signature?: string;
  extensionData?: string;
}

export class PasskeySigner implements FlowSigner {
  private readonly config: AgentWalletConfig;

  private flowAddress?: string;
  private evmAddress?: string;
  private keyIndex = 0;

  constructor(config: AgentWalletConfig) {
    this.config = config;
  }

  // ---- FlowSigner implementation ------------------------------------------

  async init(): Promise<void> {
    // Passkey signer discovers the account during the interactive
    // approval flow. For now, use the explicitly configured address.
    this.flowAddress = this.config.flowAddress;
    this.keyIndex = this.config.flowKeyIndex;
  }

  info(): SignerInfo {
    return {
      type: 'passkey',
      flowAddress: this.flowAddress,
      evmAddress: this.evmAddress,
      keyIndex: this.keyIndex,
      sigAlgo: 'ECDSA_P256',
      hashAlgo: 'SHA2_256',
    };
  }

  async signFlowTransaction(messageHex: string): Promise<SignResult> {
    // Step 1: Create approval request
    const createResp = await fetch(
      `${this.config.flowindexUrl}/api/v1/wallet/passkey/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageHex,
          address: this.flowAddress,
        }),
      },
    );

    if (!createResp.ok) {
      const body = await createResp.text();
      throw new Error(`PasskeySigner: failed to create approval (${createResp.status}): ${body}`);
    }

    const approval = (await createResp.json()) as ApprovalResponse;

    // Step 2: Poll for approval
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);

      const pollResp = await fetch(
        `${this.config.flowindexUrl}/api/v1/wallet/passkey/approve/${approval.id}`,
      );

      if (!pollResp.ok) continue;

      const status = (await pollResp.json()) as ApprovalResponse;

      if (status.status === 'approved' && status.signature) {
        return {
          signature: status.signature,
          extensionData: status.extensionData,
        };
      }

      if (status.status === 'rejected') {
        throw new Error('PasskeySigner: approval rejected by user');
      }

      if (status.status === 'expired') {
        throw new Error('PasskeySigner: approval request expired');
      }
    }

    throw new Error('PasskeySigner: approval timed out');
  }

  isHeadless(): boolean {
    return false;
  }

  // ---- Getters ------------------------------------------------------------

  getFlowAddress(): string | undefined {
    return this.flowAddress;
  }

  getKeyIndex(): number {
    return this.keyIndex;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
