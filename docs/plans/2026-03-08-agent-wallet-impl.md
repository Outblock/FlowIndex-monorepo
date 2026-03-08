# Agent Wallet MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `packages/agent-wallet`, a standalone Node.js MCP server that gives LLMs wallet capabilities for Flow + Flow EVM (signing, templates, queries).

**Architecture:** Independent MCP server (stdio transport) with 3 signer backends (local/cloud/passkey), FRW Cadence template registry, FlowIndex API client, and viem-based EVM tools. Approval manager controls whether transactions auto-sign or require confirmation.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, @trustwallet/wallet-core (WASM), viem, @onflow/fcl, zod, tsup

**Design doc:** `docs/plans/2026-03-08-agent-wallet-design.md`

---

## Phase 1: Scaffolding & Config

### Task 1: Create package scaffolding

**Files:**
- Create: `packages/agent-wallet/package.json`
- Create: `packages/agent-wallet/tsconfig.json`
- Create: `packages/agent-wallet/tsup.config.ts`
- Create: `packages/agent-wallet/project.json`
- Create: `packages/agent-wallet/bin/cli.ts`
- Create: `packages/agent-wallet/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@flowindex/agent-wallet",
  "version": "0.1.0",
  "description": "MCP server for Flow blockchain wallet — local keys, cloud wallet, passkey signing for AI agents",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "flow-agent-wallet": "./bin/cli.ts"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "bin", "README.md"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "start": "bun run src/index.ts",
    "lint": "tsc --noEmit",
    "inspect": "npx @modelcontextprotocol/inspector node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.22.0",
    "@onflow/fcl": "^1.21.9",
    "@onflow/rlp": "^1.2.2",
    "@trustwallet/wallet-core": "^4.6.0",
    "express": "^4.21.2",
    "sha3": "^2.1.4",
    "viem": "^2.39.3",
    "zod": "^3.24.3"
  },
  "devDependencies": {
    "@types/node": "^25.3.5",
    "tsup": "^8.5.0",
    "typescript": "^5.9.3"
  },
  "nx": {
    "tags": ["package"]
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"]
}
```

**Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@trustwallet/wallet-core'],
});
```

**Step 4: Create project.json**

```json
{
  "name": "agent-wallet",
  "sourceRoot": "packages/agent-wallet/src",
  "tags": ["package"],
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": { "command": "tsup", "cwd": "packages/agent-wallet" }
    },
    "lint": {
      "executor": "nx:run-commands",
      "options": { "command": "tsc --noEmit", "cwd": "packages/agent-wallet" }
    }
  }
}
```

**Step 5: Create bin/cli.ts**

```typescript
#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = resolve(__dirname, '../dist/index.js');

const server = spawn('node', [scriptPath], {
  stdio: 'inherit',
  shell: false,
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

const cleanup = () => { if (!server.killed) server.kill(); };
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
```

**Step 6: Create minimal src/index.ts**

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

console.error("Flow Agent Wallet MCP Server starting...");

async function main() {
  console.error("Flow Agent Wallet MCP Server v0.1.0 (placeholder)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 7: Install dependencies and verify build**

Run: `cd packages/agent-wallet && bun install && bun run lint`
Expected: No errors

**Step 8: Commit**

```bash
git add packages/agent-wallet/
git commit -m "feat(agent-wallet): scaffold package with build config"
```

---

### Task 2: Environment config parser

**Files:**
- Create: `packages/agent-wallet/src/config/env.ts`
- Create: `packages/agent-wallet/src/config/networks.ts`

**Step 1: Create env.ts**

```typescript
export type SignerType = 'local-key' | 'local-mnemonic' | 'cloud' | 'cloud-interactive' | 'none';

export interface AgentWalletConfig {
  // Network
  network: 'mainnet' | 'testnet';

  // Flow signing
  mnemonic?: string;
  privateKey?: string;
  flowAddress?: string;
  flowKeyIndex: number;
  sigAlgo: 'ECDSA_P256' | 'ECDSA_secp256k1';
  hashAlgo: 'SHA2_256' | 'SHA3_256';

  // EVM
  evmPrivateKey?: string;
  evmAccountIndex: number;

  // Cloud wallet
  flowindexToken?: string;
  flowindexUrl: string;

  // Approval
  approvalRequired: boolean;

  // Optional
  etherscanApiKey?: string;

  // Derived
  signerType: SignerType;
}

export function loadConfig(): AgentWalletConfig {
  const mnemonic = process.env.FLOW_MNEMONIC?.trim();
  const privateKey = process.env.FLOW_PRIVATE_KEY?.trim();
  const evmPrivateKey = process.env.EVM_PRIVATE_KEY?.trim();
  const flowindexToken = process.env.FLOWINDEX_TOKEN?.trim();

  // Auto-detect signer type
  let signerType: SignerType;
  if (mnemonic) {
    signerType = 'local-mnemonic';
  } else if (privateKey) {
    signerType = 'local-key';
  } else if (flowindexToken) {
    signerType = 'cloud';
  } else {
    signerType = 'cloud-interactive';
  }

  const network = (process.env.FLOW_NETWORK || 'mainnet') as 'mainnet' | 'testnet';

  return {
    network,
    mnemonic,
    privateKey,
    flowAddress: process.env.FLOW_ADDRESS?.trim(),
    flowKeyIndex: parseInt(process.env.FLOW_KEY_INDEX || '0', 10),
    sigAlgo: (process.env.FLOW_SIG_ALGO || 'ECDSA_secp256k1') as AgentWalletConfig['sigAlgo'],
    hashAlgo: (process.env.FLOW_HASH_ALGO || 'SHA2_256') as AgentWalletConfig['hashAlgo'],
    evmPrivateKey,
    evmAccountIndex: parseInt(process.env.EVM_ACCOUNT_INDEX || '0', 10),
    flowindexToken,
    flowindexUrl: process.env.FLOWINDEX_URL || 'https://flowindex.io',
    approvalRequired: process.env.APPROVAL_REQUIRED !== 'false',
    etherscanApiKey: process.env.ETHERSCAN_API_KEY?.trim(),
    signerType,
  };
}
```

**Step 2: Create networks.ts**

```typescript
export type FlowNetwork = 'mainnet' | 'testnet';

export interface NetworkConfig {
  accessNode: string;
  evmRpc: string;
  evmChainId: number;
  discoveryWallet: string;
  contracts: Record<string, string>;
}

export const NETWORK_CONFIG: Record<FlowNetwork, NetworkConfig> = {
  mainnet: {
    accessNode: 'https://rest-mainnet.onflow.org',
    evmRpc: 'https://mainnet.evm.nodes.onflow.org',
    evmChainId: 747,
    discoveryWallet: 'https://fcl-discovery.onflow.org/authn',
    contracts: {
      FungibleToken: '0xf233dcee88fe0abe',
      FlowToken: '0x1654653399040a61',
      NonFungibleToken: '0x1d7e57aa55817448',
      MetadataViews: '0x1d7e57aa55817448',
      EVM: '0xe467b9dd11fa00df',
      FlowEVMBridge: '0x1e4aa0b87d10b141',
      NFTCatalog: '0x49a7cda3a1eecc29',
      FlowIDTableStaking: '0x8624b52f9ddcd04a',
      HybridCustody: '0xd8a7e05a7ac670c0',
    },
  },
  testnet: {
    accessNode: 'https://rest-testnet.onflow.org',
    evmRpc: 'https://testnet.evm.nodes.onflow.org',
    evmChainId: 545,
    discoveryWallet: 'https://fcl-discovery.onflow.org/testnet/authn',
    contracts: {
      FungibleToken: '0x9a0766d93b6608b7',
      FlowToken: '0x7e60df042a9c0868',
      NonFungibleToken: '0x631e88ae7f1d7c20',
      MetadataViews: '0x631e88ae7f1d7c20',
      EVM: '0x8c5303eaa26202d6',
      FlowEVMBridge: '0xdfc20aee650fcbdf',
      NFTCatalog: '0x324c34e1c517e4db',
      FlowIDTableStaking: '0x9eca2b38b18b5dfe',
      HybridCustody: '0x294e44e1ec6993c6',
    },
  },
};

export function getFlowAccessNode(network: FlowNetwork): string {
  return NETWORK_CONFIG[network].accessNode;
}

export function getEvmRpcUrl(network: FlowNetwork): string {
  return NETWORK_CONFIG[network].evmRpc;
}
```

**Step 3: Verify lint passes**

Run: `cd packages/agent-wallet && bun run lint`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/agent-wallet/src/config/
git commit -m "feat(agent-wallet): add config parser and network definitions"
```

---

## Phase 2: Signer Layer

### Task 3: Signer interface

**Files:**
- Create: `packages/agent-wallet/src/signer/interface.ts`

**Step 1: Define the signer interface**

```typescript
export interface SignResult {
  signature: string;         // hex r||s (128 chars)
  extensionData?: string;    // FLIP-264 extension data (passkey only)
}

export interface SignerInfo {
  type: 'local' | 'cloud' | 'passkey';
  flowAddress?: string;
  evmAddress?: string;
  keyIndex: number;
  sigAlgo: string;
  hashAlgo: string;
}

export interface FlowSigner {
  /** Initialize signer, discover accounts if needed */
  init(): Promise<void>;

  /** Get signer info */
  info(): SignerInfo;

  /** Sign a Flow transaction message (hex-encoded) */
  signFlowTransaction(messageHex: string): Promise<SignResult>;

  /** Whether this signer can operate without user interaction */
  isHeadless(): boolean;
}
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/src/signer/interface.ts
git commit -m "feat(agent-wallet): add signer interface"
```

---

### Task 4: Local signer (wallet-core WASM)

Adapts logic from `runner/src/auth/localKeyManager.ts`.

**Files:**
- Create: `packages/agent-wallet/src/signer/local.ts`

**Step 1: Implement LocalSigner**

```typescript
import type { FlowSigner, SignResult, SignerInfo } from './interface.js';
import type { AgentWalletConfig } from '../config/env.js';

// wallet-core is loaded dynamically (WASM)
let walletCore: any = null;

async function loadWalletCore() {
  if (walletCore) return walletCore;
  const { initWasm } = await import('@aspect-build/aspect-wallet-core-wasm' as any).catch(() =>
    import('@aspect-build/aspect-wallet-core-wasm' as any)
  ).catch(async () => {
    // Fallback: try @trustwallet/wallet-core
    const mod = await import('@aspect-build/aspect-wallet-core-wasm' as any);
    return mod;
  });
  walletCore = await initWasm();
  return walletCore;
}

/**
 * Derives keys from mnemonic using BIP44 paths.
 * Flow: m/44'/539'/0'/0/0 (secp256k1)
 * EVM: m/44'/60'/0'/0/0
 */
function deriveFromMnemonic(
  core: any,
  mnemonic: string,
  evmAccountIndex: number
): { flowPrivateKey: string; flowPublicKey: string; evmPrivateKey: string; evmAddress: string } {
  const { HDWallet, CoinType, Curve, HexCoding } = core;

  const wallet = HDWallet.createWithMnemonic(mnemonic, '');

  // Flow key (secp256k1 via nist256p1 derivation path)
  const flowKey = wallet.getDerivedKey(CoinType.flow, 0, 0, 0);
  const flowPrivateKeyData = flowKey.data();
  const flowPrivateKey = HexCoding.encode(flowPrivateKeyData).replace('0x', '');

  // Flow public key (secp256k1, uncompressed, no 04 prefix)
  const flowPubKey = flowKey.getPublicKeySecp256k1(false);
  const flowPubData = flowPubKey.data();
  const flowPublicKey = HexCoding.encode(flowPubData).replace('0x', '').slice(2); // remove 04 prefix

  // EVM key (m/44'/60'/0'/0/index)
  const evmKey = wallet.getDerivedKey(CoinType.ethereum, evmAccountIndex, 0, 0);
  const evmPrivateKeyData = evmKey.data();
  const evmPrivateKey = HexCoding.encode(evmPrivateKeyData);

  // EVM address
  const evmPubKey = evmKey.getPublicKeySecp256k1(false);
  const { AnyAddress } = core;
  const evmAddr = AnyAddress.createWithPublicKey(evmPubKey, CoinType.ethereum);
  const evmAddress = evmAddr.description();

  return { flowPrivateKey, flowPublicKey, evmPrivateKey, evmAddress };
}

function deriveFromPrivateKey(
  core: any,
  privateKeyHex: string,
  sigAlgo: string
): { flowPrivateKey: string; flowPublicKey: string } {
  const { PrivateKey, Curve, HexCoding } = core;
  const keyData = HexCoding.decode(privateKeyHex.replace('0x', ''));
  const pk = PrivateKey.createWithData(keyData);

  const curve = sigAlgo === 'ECDSA_P256' ? Curve.nist256p1 : Curve.secp256k1;
  const pubKey = pk.getPublicKey(curve);
  const pubData = pubKey.data();
  const flowPublicKey = HexCoding.encode(pubData).replace('0x', '').slice(2); // remove prefix byte

  return { flowPrivateKey: privateKeyHex.replace('0x', ''), flowPublicKey };
}

/**
 * Sign a hex message with the given private key and hash algorithm.
 * Returns raw r||s signature (64 bytes = 128 hex chars).
 */
function signWithKey(
  core: any,
  privateKeyHex: string,
  messageHex: string,
  sigAlgo: string,
  hashAlgo: string
): string {
  const { PrivateKey, Curve, Hash, HexCoding } = core;

  // Decode message
  const msgBytes = HexCoding.decode(messageHex);

  // Hash the message
  let digest: Uint8Array;
  if (hashAlgo === 'SHA2_256') {
    digest = Hash.sha256(msgBytes);
  } else {
    digest = Hash.sha3_256(msgBytes);
  }

  // Sign
  const keyData = HexCoding.decode(privateKeyHex.replace('0x', ''));
  const pk = PrivateKey.createWithData(keyData);
  const curve = sigAlgo === 'ECDSA_P256' ? Curve.nist256p1 : Curve.secp256k1;
  const sigBytes = pk.sign(digest, curve);

  // Strip recovery byte (last byte) → 64 bytes r||s
  const sigHex = HexCoding.encode(sigBytes).replace('0x', '');
  return sigHex.slice(0, 128);
}

/**
 * Discover Flow accounts for a public key via FlowIndex API or key-indexer.
 */
async function discoverAccounts(
  publicKey: string,
  network: string,
  flowindexUrl: string
): Promise<{ address: string; keyIndex: number }[]> {
  // Try FlowIndex API first
  try {
    const resp = await fetch(`${flowindexUrl}/api/flow/key/${publicKey}`);
    if (resp.ok) {
      const data = await resp.json() as any;
      if (data.accounts?.length > 0) {
        return data.accounts
          .filter((a: any) => a.weight >= 1000)
          .map((a: any) => ({ address: a.address, keyIndex: a.keyIndex }));
      }
    }
  } catch {}

  // Fallback: Flow key-indexer
  const env = network === 'mainnet' ? 'mainnet' : 'testnet';
  try {
    const resp = await fetch(`https://${env}.key-indexer.flow.com/key/${publicKey}`);
    if (resp.ok) {
      const data = await resp.json() as any;
      if (data.accounts?.length > 0) {
        return data.accounts
          .filter((a: any) => a.weight >= 1000)
          .map((a: any) => ({ address: a.address, keyIndex: a.keyIndex }));
      }
    }
  } catch {}

  return [];
}

export class LocalSigner implements FlowSigner {
  private config: AgentWalletConfig;
  private core: any = null;
  private flowPrivateKey = '';
  private flowPublicKey = '';
  private flowAddress = '';
  private keyIndex = 0;
  private evmPrivateKey = '';
  private evmAddress = '';

  constructor(config: AgentWalletConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    this.core = await loadWalletCore();

    if (this.config.mnemonic) {
      const derived = deriveFromMnemonic(this.core, this.config.mnemonic, this.config.evmAccountIndex);
      this.flowPrivateKey = derived.flowPrivateKey;
      this.flowPublicKey = derived.flowPublicKey;
      this.evmPrivateKey = derived.evmPrivateKey;
      this.evmAddress = derived.evmAddress;
    } else if (this.config.privateKey) {
      const derived = deriveFromPrivateKey(this.core, this.config.privateKey, this.config.sigAlgo);
      this.flowPrivateKey = derived.flowPrivateKey;
      this.flowPublicKey = derived.flowPublicKey;
    }

    // Use configured address or discover
    if (this.config.flowAddress) {
      this.flowAddress = this.config.flowAddress;
      this.keyIndex = this.config.flowKeyIndex;
    } else if (this.flowPublicKey) {
      const accounts = await discoverAccounts(
        this.flowPublicKey,
        this.config.network,
        this.config.flowindexUrl
      );
      if (accounts.length > 0) {
        this.flowAddress = accounts[0].address;
        this.keyIndex = accounts[0].keyIndex;
        console.error(`Discovered Flow account: ${this.flowAddress} (key index ${this.keyIndex})`);
      } else {
        console.error(`No Flow accounts found for public key. Use wallet_status to check.`);
      }
    }
  }

  info(): SignerInfo {
    return {
      type: 'local',
      flowAddress: this.flowAddress || undefined,
      evmAddress: this.evmAddress || undefined,
      keyIndex: this.keyIndex,
      sigAlgo: this.config.sigAlgo,
      hashAlgo: this.config.hashAlgo,
    };
  }

  async signFlowTransaction(messageHex: string): Promise<SignResult> {
    if (!this.flowPrivateKey) throw new Error('No Flow private key configured');
    const signature = signWithKey(
      this.core,
      this.flowPrivateKey,
      messageHex,
      this.config.sigAlgo,
      this.config.hashAlgo
    );
    return { signature };
  }

  /** Get EVM private key (for viem wallet client) */
  getEvmPrivateKey(): string | undefined {
    return this.evmPrivateKey || this.config.evmPrivateKey || undefined;
  }

  getFlowAddress(): string { return this.flowAddress; }
  getKeyIndex(): number { return this.keyIndex; }

  isHeadless(): boolean { return true; }
}
```

**Step 2: Verify lint**

Run: `cd packages/agent-wallet && bun run lint`
Expected: No errors (may need to adjust wallet-core import based on actual package)

**Step 3: Commit**

```bash
git add packages/agent-wallet/src/signer/local.ts
git commit -m "feat(agent-wallet): add LocalSigner with wallet-core WASM"
```

---

### Task 5: Cloud signer stub

**Files:**
- Create: `packages/agent-wallet/src/signer/cloud.ts`

**Step 1: Implement CloudSigner**

```typescript
import type { FlowSigner, SignResult, SignerInfo } from './interface.js';
import type { AgentWalletConfig } from '../config/env.js';

export class CloudSigner implements FlowSigner {
  private config: AgentWalletConfig;
  private token: string | null;
  private flowAddress = '';
  private keyIndex = 0;

  constructor(config: AgentWalletConfig) {
    this.config = config;
    this.token = config.flowindexToken || null;
  }

  async init(): Promise<void> {
    if (!this.token) {
      console.error('No FLOWINDEX_TOKEN set. Use wallet_login tool to authenticate.');
      return;
    }
    // Fetch account info from FlowIndex
    try {
      const resp = await fetch(`${this.config.flowindexUrl}/api/v1/wallet/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (resp.ok) {
        const data = await resp.json() as any;
        this.flowAddress = data.flow_address || '';
        this.keyIndex = data.key_index || 0;
        console.error(`Cloud wallet: ${this.flowAddress}`);
      }
    } catch (e) {
      console.error('Failed to fetch cloud wallet info:', e);
    }
  }

  setToken(token: string) {
    this.token = token;
  }

  info(): SignerInfo {
    return {
      type: 'cloud',
      flowAddress: this.flowAddress || undefined,
      keyIndex: this.keyIndex,
      sigAlgo: 'ECDSA_P256',
      hashAlgo: 'SHA3_256',
    };
  }

  async signFlowTransaction(messageHex: string): Promise<SignResult> {
    if (!this.token) throw new Error('Not authenticated. Use wallet_login first.');

    const resp = await fetch(`${this.config.flowindexUrl}/api/v1/wallet/sign`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: messageHex }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Cloud signing failed: ${err}`);
    }

    const data = await resp.json() as any;
    return { signature: data.signature };
  }

  getFlowAddress(): string { return this.flowAddress; }
  getKeyIndex(): number { return this.keyIndex; }

  isHeadless(): boolean { return !!this.token; }
}
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/src/signer/cloud.ts
git commit -m "feat(agent-wallet): add CloudSigner stub"
```

---

### Task 6: Passkey signer stub

**Files:**
- Create: `packages/agent-wallet/src/signer/passkey.ts`

**Step 1: Implement PasskeySigner**

```typescript
import type { FlowSigner, SignResult, SignerInfo } from './interface.js';
import type { AgentWalletConfig } from '../config/env.js';

export class PasskeySigner implements FlowSigner {
  private config: AgentWalletConfig;
  private token: string | null;
  private flowAddress = '';
  private keyIndex = 0;

  constructor(config: AgentWalletConfig) {
    this.config = config;
    this.token = config.flowindexToken || null;
  }

  async init(): Promise<void> {
    // Passkey signer requires browser interaction, init is deferred
    console.error('PasskeySigner: requires browser-based approval for each transaction.');
  }

  info(): SignerInfo {
    return {
      type: 'passkey',
      flowAddress: this.flowAddress || undefined,
      keyIndex: this.keyIndex,
      sigAlgo: 'ECDSA_P256',
      hashAlgo: 'SHA3_256',
    };
  }

  async signFlowTransaction(messageHex: string): Promise<SignResult> {
    // Create a pending approval on the server, return URL for user to approve
    if (!this.token) throw new Error('Not authenticated. Use wallet_login first.');

    const resp = await fetch(`${this.config.flowindexUrl}/api/v1/wallet/passkey/approve`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: messageHex }),
    });

    if (!resp.ok) throw new Error(`Passkey approval request failed: ${await resp.text()}`);

    const data = await resp.json() as any;
    const approveUrl = data.approve_url;
    const approvalId = data.approval_id;

    // Poll for completion
    console.error(`Passkey approval required: ${approveUrl}`);
    const maxWait = 300_000; // 5 minutes
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      const pollResp = await fetch(`${this.config.flowindexUrl}/api/v1/wallet/passkey/status/${approvalId}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (pollResp.ok) {
        const status = await pollResp.json() as any;
        if (status.signed) {
          return { signature: status.signature, extensionData: status.extension_data };
        }
        if (status.rejected) throw new Error('User rejected the transaction.');
      }
    }

    throw new Error('Passkey approval timed out (5 min).');
  }

  isHeadless(): boolean { return false; }
}
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/src/signer/passkey.ts
git commit -m "feat(agent-wallet): add PasskeySigner stub"
```

---

## Phase 3: MCP Server + Core Tools

### Task 7: MCP server setup

**Files:**
- Create: `packages/agent-wallet/src/server/server.ts`
- Modify: `packages/agent-wallet/src/index.ts`

**Step 1: Create server.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig, type AgentWalletConfig } from '../config/env.js';
import { LocalSigner } from '../signer/local.js';
import { CloudSigner } from '../signer/cloud.js';
import type { FlowSigner } from '../signer/interface.js';
import { registerWalletTools } from '../tools/wallet.js';
import { registerTemplateTools } from '../tools/templates.js';
import { registerFlowQueryTools } from '../tools/flow-query.js';
import { registerEvmTools } from '../tools/evm.js';
import { registerApprovalTools } from '../tools/approval.js';

export interface ServerContext {
  config: AgentWalletConfig;
  signer: FlowSigner;
  cloudSigner: CloudSigner;
}

export async function createServer(): Promise<McpServer> {
  const config = loadConfig();

  // Initialize signer based on config
  let signer: FlowSigner;
  const cloudSigner = new CloudSigner(config);

  if (config.signerType === 'local-mnemonic' || config.signerType === 'local-key') {
    const local = new LocalSigner(config);
    await local.init();
    signer = local;
  } else {
    await cloudSigner.init();
    signer = cloudSigner;
  }

  const ctx: ServerContext = { config, signer, cloudSigner };

  const server = new McpServer(
    { name: "flow-agent-wallet", version: "0.1.0" },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: false, listChanged: true },
        logging: {},
      },
    }
  );

  // Register all tool groups
  registerWalletTools(server, ctx);
  registerTemplateTools(server, ctx);
  registerFlowQueryTools(server, ctx);
  registerEvmTools(server, ctx);
  registerApprovalTools(server, ctx);

  const info = signer.info();
  console.error(`Flow Agent Wallet MCP Server v0.1.0`);
  console.error(`Network: ${config.network}`);
  console.error(`Signer: ${info.type} | Flow: ${info.flowAddress || 'none'} | EVM: ${info.evmAddress || 'none'}`);
  console.error(`Approval: ${config.approvalRequired ? 'required' : 'headless'}`);

  return server;
}
```

**Step 2: Update index.ts**

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from './server/server.js';

async function main() {
  try {
    const server = await createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Flow Agent Wallet MCP Server running on stdio");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
```

**Step 3: Create tool stubs** (empty register functions so server.ts compiles)

Create `packages/agent-wallet/src/tools/wallet.ts`:
```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from '../server/server.js';
export function registerWalletTools(server: McpServer, ctx: ServerContext) {}
```

Create same pattern for:
- `packages/agent-wallet/src/tools/templates.ts`
- `packages/agent-wallet/src/tools/flow-query.ts`
- `packages/agent-wallet/src/tools/evm.ts`
- `packages/agent-wallet/src/tools/approval.ts`

**Step 4: Verify lint**

Run: `cd packages/agent-wallet && bun run lint`

**Step 5: Commit**

```bash
git add packages/agent-wallet/src/server/ packages/agent-wallet/src/tools/ packages/agent-wallet/src/index.ts
git commit -m "feat(agent-wallet): add MCP server setup with tool registration"
```

---

### Task 8: Wallet tools

**Files:**
- Modify: `packages/agent-wallet/src/tools/wallet.ts`

**Step 1: Implement wallet tools**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import type { ServerContext } from '../server/server.js';

export function registerWalletTools(server: McpServer, ctx: ServerContext) {
  server.registerTool(
    "wallet_status",
    {
      description: "Get current wallet status: signer type, Flow address, EVM address, network, approval mode",
      inputSchema: {},
      annotations: { title: "Wallet Status", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const info = ctx.signer.info();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            signer_type: info.type,
            flow_address: info.flowAddress || null,
            evm_address: info.evmAddress || null,
            key_index: info.keyIndex,
            sig_algo: info.sigAlgo,
            hash_algo: info.hashAlgo,
            network: ctx.config.network,
            approval_required: ctx.config.approvalRequired,
            headless: ctx.signer.isHeadless(),
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool(
    "wallet_login",
    {
      description: "Generate a login URL for cloud wallet authentication. User opens the URL in a browser to log in. Returns the URL and session status.",
      inputSchema: {},
      annotations: { title: "Wallet Login", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async () => {
      // Generate login session
      try {
        const resp = await fetch(`${ctx.config.flowindexUrl}/api/v1/wallet/agent/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!resp.ok) throw new Error(`Login init failed: ${await resp.text()}`);

        const data = await resp.json() as any;
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "pending",
              login_url: data.url,
              session_id: data.session_id,
              message: "Please open the login URL in your browser to authenticate.",
              expires_in: 300,
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "wallet_login_status",
    {
      description: "Check if the user has completed browser login after calling wallet_login.",
      inputSchema: {
        session_id: z.string().describe("Session ID from wallet_login"),
      },
      annotations: { title: "Check Login Status", readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ session_id }) => {
      try {
        const resp = await fetch(`${ctx.config.flowindexUrl}/api/v1/wallet/agent/status/${session_id}`);
        if (!resp.ok) throw new Error(`Status check failed: ${await resp.text()}`);

        const data = await resp.json() as any;

        if (data.authenticated && data.token) {
          // Update the cloud signer with the new token
          ctx.cloudSigner.setToken(data.token);
          await ctx.cloudSigner.init();
          // Switch to cloud signer if not already using local
          if (ctx.config.signerType === 'cloud-interactive') {
            ctx.signer = ctx.cloudSigner;
          }
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              authenticated: data.authenticated || false,
              flow_address: data.flow_address || null,
            }, null, 2),
          }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          isError: true,
        };
      }
    }
  );
}
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/src/tools/wallet.ts
git commit -m "feat(agent-wallet): add wallet_status, wallet_login, wallet_login_status tools"
```

---

## Phase 4: Cadence Templates

### Task 9: Copy FRW Cadence templates

**Step 1: Create template directory structure**

```bash
mkdir -p packages/agent-wallet/src/templates/cadence/{token,collection,evm,bridge,hybrid-custody,lost-and-found,base}
```

**Step 2: Fetch FRW templates**

Clone or download from `https://github.com/onflow/FRW-monorepo/tree/dev/packages/cadence/src/cadence/` and copy the `.cdc` files into the corresponding directories.

Key files to copy:
- `Token/transactions/transfer_tokens_v3.cdc` → `token/transfer_tokens_v3.cdc`
- `Token/transactions/enable_token_storage_v2.cdc` → `token/enable_token_storage_v2.cdc`
- `Token/scripts/get_token_balance_storage.cdc` → `token/get_token_balance_storage.cdc`
- `Collection/transactions/send_nft.cdc` → `collection/send_nft.cdc`
- `Collection/transactions/batch_send_nft_v3.cdc` → `collection/batch_send_nft_v3.cdc`
- `EVM/transaction/create_coa.cdc` → `evm/create_coa.cdc`
- `EVM/transaction/call_contract.cdc` → `evm/call_contract.cdc`
- `EVM/transaction/transfer_flow_to_evm_address.cdc` → `evm/transfer_flow_to_evm_address.cdc`
- `Bridge/transactions/*` → `bridge/`
- `HybridCustody/transactions/*` + `HybridCustody/scripts/*` → `hybrid-custody/`
- `LostAndFound/*` → `lost-and-found/`
- `Base/*` → `base/`

**Step 3: Commit**

```bash
git add packages/agent-wallet/src/templates/cadence/
git commit -m "feat(agent-wallet): copy FRW Cadence templates"
```

---

### Task 10: Template registry

**Files:**
- Create: `packages/agent-wallet/src/templates/registry.ts`

**Step 1: Implement template registry**

```typescript
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface TemplateArg {
  name: string;
  type: string;         // Cadence type: Address, UFix64, String, UInt64, etc.
  description: string;
}

export interface Template {
  name: string;
  category: string;
  type: 'transaction' | 'script';
  description: string;
  cadence: string;
  args: TemplateArg[];
}

// Template metadata (manually maintained for args + descriptions)
const TEMPLATE_META: Record<string, Omit<Template, 'name' | 'category' | 'cadence'>> = {
  // Token
  'transfer_tokens_v3': {
    type: 'transaction',
    description: 'Transfer fungible tokens to an address',
    args: [
      { name: 'amount', type: 'UFix64', description: 'Amount to transfer' },
      { name: 'to', type: 'Address', description: 'Recipient address' },
      { name: 'contractAddress', type: 'Address', description: 'Token contract address' },
      { name: 'contractName', type: 'String', description: 'Token contract name' },
      { name: 'storagePath', type: 'String', description: 'Token storage path identifier' },
    ],
  },
  'enable_token_storage_v2': {
    type: 'transaction',
    description: 'Enable token vault storage for receiving tokens',
    args: [
      { name: 'contractAddress', type: 'Address', description: 'Token contract address' },
      { name: 'contractName', type: 'String', description: 'Token contract name' },
      { name: 'storagePath', type: 'String', description: 'Token storage path identifier' },
      { name: 'receiverPath', type: 'String', description: 'Token receiver path identifier' },
      { name: 'balancePath', type: 'String', description: 'Token balance path identifier' },
    ],
  },
  'get_token_balance_storage': {
    type: 'script',
    description: 'Get fungible token balance for an address',
    args: [
      { name: 'address', type: 'Address', description: 'Account address' },
      { name: 'path', type: 'String', description: 'Token storage path identifier' },
    ],
  },

  // Collection (NFT)
  'send_nft': {
    type: 'transaction',
    description: 'Transfer a single NFT to another address',
    args: [
      { name: 'recipient', type: 'Address', description: 'Recipient address' },
      { name: 'nftContractAddress', type: 'Address', description: 'NFT contract address' },
      { name: 'nftContractName', type: 'String', description: 'NFT contract name' },
      { name: 'id', type: 'UInt64', description: 'NFT ID' },
    ],
  },
  'batch_send_nft_v3': {
    type: 'transaction',
    description: 'Transfer multiple NFTs to another address',
    args: [
      { name: 'recipient', type: 'Address', description: 'Recipient address' },
      { name: 'nftContractAddress', type: 'Address', description: 'NFT contract address' },
      { name: 'nftContractName', type: 'String', description: 'NFT contract name' },
      { name: 'ids', type: '[UInt64]', description: 'Array of NFT IDs' },
    ],
  },

  // EVM
  'create_coa': {
    type: 'transaction',
    description: 'Create a Cadence Owned Account (COA) for EVM interaction',
    args: [],
  },
  'call_contract': {
    type: 'transaction',
    description: 'Call an EVM contract from Flow',
    args: [
      { name: 'evmContractHex', type: 'String', description: 'EVM contract address (hex)' },
      { name: 'calldata', type: 'String', description: 'ABI-encoded calldata (hex)' },
      { name: 'gasLimit', type: 'UInt64', description: 'Gas limit' },
      { name: 'value', type: 'UFix64', description: 'FLOW value to send' },
    ],
  },
  'transfer_flow_to_evm_address': {
    type: 'transaction',
    description: 'Transfer FLOW from Cadence to an EVM address',
    args: [
      { name: 'amount', type: 'UFix64', description: 'Amount of FLOW to transfer' },
      { name: 'evmAddress', type: 'String', description: 'Destination EVM address (hex)' },
    ],
  },

  // Bridge
  'bridge_tokens_to_evm_address_v2': {
    type: 'transaction',
    description: 'Bridge fungible tokens from Flow to an EVM address',
    args: [
      { name: 'vaultIdentifier', type: 'String', description: 'Vault type identifier' },
      { name: 'amount', type: 'UFix64', description: 'Amount to bridge' },
      { name: 'evmAddress', type: 'String', description: 'Destination EVM address (hex)' },
    ],
  },
  'bridge_tokens_from_evm_to_flow_v3': {
    type: 'transaction',
    description: 'Bridge fungible tokens from EVM to Flow',
    args: [
      { name: 'vaultIdentifier', type: 'String', description: 'Vault type identifier' },
      { name: 'amount', type: 'UInt256', description: 'Amount to bridge (EVM uint256)' },
    ],
  },
};

let _templates: Map<string, Template> | null = null;

function loadTemplatesFromDisk(): Map<string, Template> {
  const templates = new Map<string, Template>();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const cadenceDir = join(__dirname, 'cadence');

  if (!existsSync(cadenceDir)) {
    console.error(`Warning: Cadence template directory not found at ${cadenceDir}`);
    return templates;
  }

  const categories = readdirSync(cadenceDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const category of categories) {
    const catDir = join(cadenceDir, category);
    const files = readdirSync(catDir).filter(f => f.endsWith('.cdc'));

    for (const file of files) {
      const name = file.replace('.cdc', '');
      const cadence = readFileSync(join(catDir, file), 'utf-8');
      const meta = TEMPLATE_META[name];

      templates.set(name, {
        name,
        category,
        cadence,
        type: meta?.type || (cadence.includes('transaction') ? 'transaction' : 'script'),
        description: meta?.description || `${category}/${name}`,
        args: meta?.args || [],
      });
    }
  }

  return templates;
}

export function getTemplates(): Map<string, Template> {
  if (!_templates) {
    _templates = loadTemplatesFromDisk();
  }
  return _templates;
}

export function getTemplate(name: string): Template | undefined {
  return getTemplates().get(name);
}

export function listTemplates(category?: string): Template[] {
  const all = Array.from(getTemplates().values());
  if (category) return all.filter(t => t.category === category);
  return all;
}
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/src/templates/registry.ts
git commit -m "feat(agent-wallet): add Cadence template registry"
```

---

### Task 11: Template MCP tools

**Files:**
- Modify: `packages/agent-wallet/src/tools/templates.ts`

**Step 1: Implement template tools**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import type { ServerContext } from '../server/server.js';
import { listTemplates, getTemplate } from '../templates/registry.js';

export function registerTemplateTools(server: McpServer, ctx: ServerContext) {

  server.registerTool(
    "list_templates",
    {
      description: "List available Cadence transaction templates. Filter by category: token, collection, evm, bridge, hybrid-custody, lost-and-found, base",
      inputSchema: {
        category: z.string().optional().describe("Filter by category name"),
      },
      annotations: { title: "List Templates", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ category }) => {
      const templates = listTemplates(category);
      const summary = templates.map(t => ({
        name: t.name,
        category: t.category,
        type: t.type,
        description: t.description,
        arg_count: t.args.length,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ templates: summary, count: summary.length }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_template",
    {
      description: "Get full details of a Cadence template including code and parameter schema",
      inputSchema: {
        name: z.string().describe("Template name (e.g. 'transfer_tokens_v3')"),
      },
      annotations: { title: "Get Template", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ name }) => {
      const template = getTemplate(name);
      if (!template) {
        return { content: [{ type: "text", text: `Template '${name}' not found. Use list_templates to see available templates.` }], isError: true };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(template, null, 2) }],
      };
    }
  );

  server.registerTool(
    "execute_script",
    {
      description: "Execute a read-only Cadence script (no signing required). Can use a template name or provide raw Cadence code.",
      inputSchema: {
        template_name: z.string().optional().describe("Template name for a script template"),
        code: z.string().optional().describe("Raw Cadence script code (if not using template)"),
        args: z.array(z.any()).optional().describe("Script arguments as JSON array"),
      },
      annotations: { title: "Execute Script", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ template_name, code, args }) => {
      let cadenceCode = code;
      if (template_name) {
        const t = getTemplate(template_name);
        if (!t) return { content: [{ type: "text", text: `Template '${template_name}' not found.` }], isError: true };
        if (t.type !== 'script') return { content: [{ type: "text", text: `Template '${template_name}' is a transaction, not a script.` }], isError: true };
        cadenceCode = t.cadence;
      }
      if (!cadenceCode) return { content: [{ type: "text", text: "Provide either template_name or code." }], isError: true };

      try {
        // Dynamic import FCL to avoid top-level import issues
        const fcl = await import('@onflow/fcl');
        const result = await fcl.query({ cadence: cadenceCode, args: () => args || [] });
        return { content: [{ type: "text", text: JSON.stringify({ result }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Script error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "execute_template",
    {
      description: "Execute a Cadence transaction template. Requires signing. If approval is enabled, returns a pending transaction for confirmation.",
      inputSchema: {
        template_name: z.string().describe("Template name (e.g. 'transfer_tokens_v3')"),
        args: z.record(z.any()).describe("Template arguments as key-value pairs matching the template's arg schema"),
      },
      annotations: { title: "Execute Template", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ template_name, args }) => {
      const template = getTemplate(template_name);
      if (!template) return { content: [{ type: "text", text: `Template '${template_name}' not found.` }], isError: true };
      if (template.type !== 'transaction') return { content: [{ type: "text", text: `Template '${template_name}' is a script, use execute_script.` }], isError: true };

      const info = ctx.signer.info();
      if (!info.flowAddress) return { content: [{ type: "text", text: "No Flow address configured. Check wallet_status." }], isError: true };

      // Build human-readable summary
      const summary = {
        template: template_name,
        description: template.description,
        args,
        signer: info.flowAddress,
        network: ctx.config.network,
      };

      // If approval required, queue the transaction
      if (ctx.config.approvalRequired && ctx.signer.isHeadless()) {
        const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        // Store pending tx in approval manager (see Task 12)
        const { addPendingTx } = await import('../approval/manager.js');
        addPendingTx(txId, { template, args, summary });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "pending_approval",
              tx_id: txId,
              summary,
              message: "Transaction requires approval. Use confirm_transaction or cancel_transaction.",
            }, null, 2),
          }],
        };
      }

      // Auto-sign and submit
      try {
        const result = await executeFlowTransaction(ctx, template.cadence, args, info);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Transaction error: ${e.message}` }], isError: true };
      }
    }
  );
}

/** Execute a Flow transaction with FCL + signer */
export async function executeFlowTransaction(
  ctx: ServerContext,
  cadenceCode: string,
  args: Record<string, any>,
  signerInfo: { flowAddress?: string; keyIndex: number; sigAlgo: string; hashAlgo: string }
) {
  const fcl = await import('@onflow/fcl');

  // Map algo names to FCL constants
  const SIG_ALGO_MAP: Record<string, number> = { 'ECDSA_P256': 2, 'ECDSA_secp256k1': 3 };
  const HASH_ALGO_MAP: Record<string, number> = { 'SHA2_256': 1, 'SHA3_256': 3 };

  const sigAlgoNum = SIG_ALGO_MAP[signerInfo.sigAlgo] || 3;
  const hashAlgoNum = HASH_ALGO_MAP[signerInfo.hashAlgo] || 1;

  const authz = (account: any) => ({
    ...account,
    addr: fcl.sansPrefix(signerInfo.flowAddress),
    keyId: signerInfo.keyIndex,
    signingFunction: async (signable: any) => {
      const result = await ctx.signer.signFlowTransaction(signable.message);
      return {
        addr: fcl.sansPrefix(signerInfo.flowAddress),
        keyId: signerInfo.keyIndex,
        signature: result.signature,
        ...(result.extensionData ? { extensionData: result.extensionData } : {}),
      };
    },
    signAlgo: sigAlgoNum,
    hashAlgo: hashAlgoNum,
  });

  const txId = await fcl.mutate({
    cadence: cadenceCode,
    args: () => Object.values(args), // TODO: proper Cadence type encoding
    limit: 9999,
    proposer: authz,
    payer: authz,
    authorizations: [authz],
  });

  // Wait for seal
  const result = await fcl.tx(txId).onceSealed();

  return {
    status: 'sealed',
    tx_id: txId,
    block_height: result.blockHeight,
    events: result.events?.map((e: any) => ({ type: e.type, data: e.data })) || [],
  };
}
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/src/tools/templates.ts
git commit -m "feat(agent-wallet): add template MCP tools (list, get, execute_script, execute_template)"
```

---

## Phase 5: Approval Manager

### Task 12: Approval manager + tools

**Files:**
- Create: `packages/agent-wallet/src/approval/manager.ts`
- Modify: `packages/agent-wallet/src/tools/approval.ts`

**Step 1: Create approval manager**

```typescript
import type { Template } from '../templates/registry.js';

export interface PendingTx {
  template: Template;
  args: Record<string, any>;
  summary: Record<string, any>;
  createdAt: number;
}

const pendingTxs = new Map<string, PendingTx>();

export function addPendingTx(txId: string, tx: PendingTx) {
  pendingTxs.set(txId, { ...tx, createdAt: Date.now() });
}

export function getPendingTx(txId: string): PendingTx | undefined {
  return pendingTxs.get(txId);
}

export function removePendingTx(txId: string): boolean {
  return pendingTxs.delete(txId);
}

export function listPendingTxs(): Array<{ tx_id: string; summary: Record<string, any>; created_at: number }> {
  return Array.from(pendingTxs.entries()).map(([id, tx]) => ({
    tx_id: id,
    summary: tx.summary,
    created_at: tx.createdAt,
  }));
}
```

**Step 2: Implement approval tools**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import type { ServerContext } from '../server/server.js';
import { getPendingTx, removePendingTx, listPendingTxs } from '../approval/manager.js';
import { executeFlowTransaction } from './templates.js';

export function registerApprovalTools(server: McpServer, ctx: ServerContext) {

  server.registerTool(
    "confirm_transaction",
    {
      description: "Confirm and execute a pending transaction that was queued for approval",
      inputSchema: {
        tx_id: z.string().describe("Transaction ID from execute_template response"),
      },
      annotations: { title: "Confirm Transaction", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ tx_id }) => {
      const pending = getPendingTx(tx_id);
      if (!pending) return { content: [{ type: "text", text: `No pending transaction with ID '${tx_id}'.` }], isError: true };

      removePendingTx(tx_id);

      try {
        const info = ctx.signer.info();
        const result = await executeFlowTransaction(ctx, pending.template.cadence, pending.args, info);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Transaction failed: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "cancel_transaction",
    {
      description: "Cancel a pending transaction",
      inputSchema: {
        tx_id: z.string().describe("Transaction ID to cancel"),
      },
      annotations: { title: "Cancel Transaction", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ tx_id }) => {
      const removed = removePendingTx(tx_id);
      return {
        content: [{ type: "text", text: JSON.stringify({ cancelled: removed, tx_id }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_pending",
    {
      description: "List all transactions pending approval",
      inputSchema: {},
      annotations: { title: "List Pending", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const pending = listPendingTxs();
      return {
        content: [{ type: "text", text: JSON.stringify({ pending, count: pending.length }, null, 2) }],
      };
    }
  );
}
```

**Step 3: Commit**

```bash
git add packages/agent-wallet/src/approval/ packages/agent-wallet/src/tools/approval.ts
git commit -m "feat(agent-wallet): add approval manager with confirm/cancel/list tools"
```

---

## Phase 6: Query & EVM Tools

### Task 13: FlowIndex API client + flow query tools

**Files:**
- Create: `packages/agent-wallet/src/flowindex/client.ts`
- Modify: `packages/agent-wallet/src/tools/flow-query.ts`

**Step 1: Create FlowIndex API client**

```typescript
export class FlowIndexClient {
  constructor(private baseUrl: string) {}

  private async get(path: string): Promise<any> {
    const resp = await fetch(`${this.baseUrl}${path}`);
    if (!resp.ok) throw new Error(`FlowIndex API error ${resp.status}: ${await resp.text()}`);
    return resp.json();
  }

  async getAccount(address: string) {
    return this.get(`/flow/v1/account/${address}`);
  }

  async getFlowBalance(address: string) {
    return this.get(`/flow/v1/account/${address}/balance`);
  }

  async getFtBalances(address: string) {
    return this.get(`/flow/v1/account/${address}/ft`);
  }

  async getNftCollections(address: string) {
    return this.get(`/flow/v1/account/${address}/nft`);
  }

  async getTransaction(txId: string) {
    return this.get(`/flow/v1/transaction/${txId}`);
  }

  async getBlock(height: string) {
    return this.get(`/flow/v1/block/${height}`);
  }

  async searchKey(publicKey: string) {
    return this.get(`/api/flow/key/${publicKey}`);
  }
}
```

**Step 2: Implement flow query tools**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import type { ServerContext } from '../server/server.js';
import { FlowIndexClient } from '../flowindex/client.js';

export function registerFlowQueryTools(server: McpServer, ctx: ServerContext) {
  const client = new FlowIndexClient(ctx.config.flowindexUrl);

  server.registerTool(
    "get_account",
    {
      description: "Get Flow account information: balance, keys, contracts, storage",
      inputSchema: { address: z.string().describe("Flow address (with or without 0x prefix)") },
      annotations: { title: "Get Account", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ address }) => {
      try {
        const data = await client.getAccount(address);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_flow_balance",
    {
      description: "Get FLOW token balance for an address",
      inputSchema: { address: z.string().describe("Flow address") },
      annotations: { title: "Get FLOW Balance", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ address }) => {
      try {
        const data = await client.getFlowBalance(address);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_ft_balance",
    {
      description: "Get fungible token balances for an address (all tokens or specific)",
      inputSchema: { address: z.string().describe("Flow address") },
      annotations: { title: "Get FT Balance", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ address }) => {
      try {
        const data = await client.getFtBalances(address);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_nft_collection",
    {
      description: "Get NFT collections for an address",
      inputSchema: { address: z.string().describe("Flow address") },
      annotations: { title: "Get NFT Collection", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ address }) => {
      try {
        const data = await client.getNftCollections(address);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_transaction",
    {
      description: "Get transaction details and status",
      inputSchema: { tx_id: z.string().describe("Transaction ID (hash)") },
      annotations: { title: "Get Transaction", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tx_id }) => {
      try {
        const data = await client.getTransaction(tx_id);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );
}
```

**Step 3: Commit**

```bash
git add packages/agent-wallet/src/flowindex/ packages/agent-wallet/src/tools/flow-query.ts
git commit -m "feat(agent-wallet): add FlowIndex API client and flow query tools"
```

---

### Task 14: EVM tools (via viem)

Adapted from flow-evm-mcp-server patterns.

**Files:**
- Modify: `packages/agent-wallet/src/tools/evm.ts`

**Step 1: Implement EVM tools**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { createPublicClient, createWalletClient, http, formatEther, parseEther, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { flowMainnet, flowTestnet } from 'viem/chains';
import type { ServerContext } from '../server/server.js';
import { LocalSigner } from '../signer/local.js';

function getChain(network: string) {
  return network === 'testnet' ? flowTestnet : flowMainnet;
}

function getPublicClient(network: string) {
  const chain = getChain(network);
  return createPublicClient({ chain, transport: http() });
}

function getEvmAccount(ctx: ServerContext) {
  // Try to get EVM private key from local signer
  if (ctx.signer instanceof LocalSigner) {
    const evmKey = ctx.signer.getEvmPrivateKey();
    if (evmKey) {
      const key = (evmKey.startsWith('0x') ? evmKey : `0x${evmKey}`) as Hex;
      return privateKeyToAccount(key);
    }
  }
  // Try config
  if (ctx.config.evmPrivateKey) {
    const key = (ctx.config.evmPrivateKey.startsWith('0x') ? ctx.config.evmPrivateKey : `0x${ctx.config.evmPrivateKey}`) as Hex;
    return privateKeyToAccount(key);
  }
  if (ctx.config.mnemonic) {
    return mnemonicToAccount(ctx.config.mnemonic, { accountIndex: ctx.config.evmAccountIndex });
  }
  return null;
}

export function registerEvmTools(server: McpServer, ctx: ServerContext) {

  server.registerTool(
    "evm_wallet_address",
    {
      description: "Get the current EVM wallet address (EOA derived from mnemonic or private key)",
      inputSchema: {},
      annotations: { title: "EVM Wallet Address", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const account = getEvmAccount(ctx);
      if (!account) return { content: [{ type: "text", text: "No EVM key configured. Set FLOW_MNEMONIC or EVM_PRIVATE_KEY." }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify({ evm_address: account.address }, null, 2) }] };
    }
  );

  server.registerTool(
    "evm_get_balance",
    {
      description: "Get native token (FLOW) balance on Flow EVM",
      inputSchema: { address: z.string().describe("EVM address (0x...)") },
      annotations: { title: "EVM Get Balance", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ address }) => {
      try {
        const client = getPublicClient(ctx.config.network);
        const balance = await client.getBalance({ address: address as Address });
        return { content: [{ type: "text", text: JSON.stringify({ address, balance: formatEther(balance), raw: balance.toString() }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "evm_get_token_balance",
    {
      description: "Get ERC20 token balance on Flow EVM",
      inputSchema: {
        token_address: z.string().describe("ERC20 contract address"),
        owner: z.string().describe("Owner address to check balance for"),
      },
      annotations: { title: "EVM Token Balance", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ token_address, owner }) => {
      try {
        const client = getPublicClient(ctx.config.network);
        const [balance, decimals, symbol] = await Promise.all([
          client.readContract({ address: token_address as Address, abi: ERC20_ABI, functionName: 'balanceOf', args: [owner as Address] }),
          client.readContract({ address: token_address as Address, abi: ERC20_ABI, functionName: 'decimals' }).catch(() => 18),
          client.readContract({ address: token_address as Address, abi: ERC20_ABI, functionName: 'symbol' }).catch(() => 'UNKNOWN'),
        ]);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ token: token_address, owner, balance: formatUnits(balance as bigint, decimals as number), symbol, raw: (balance as bigint).toString() }, null, 2),
          }],
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "evm_transfer",
    {
      description: "Transfer native FLOW tokens on Flow EVM",
      inputSchema: {
        to: z.string().describe("Destination EVM address"),
        amount: z.string().describe("Amount in FLOW (e.g. '1.5')"),
      },
      annotations: { title: "EVM Transfer", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ to, amount }) => {
      const account = getEvmAccount(ctx);
      if (!account) return { content: [{ type: "text", text: "No EVM key configured." }], isError: true };

      try {
        const chain = getChain(ctx.config.network);
        const walletClient = createWalletClient({ account, chain, transport: http() });
        const hash = await walletClient.sendTransaction({ to: to as Address, value: parseEther(amount) });
        return { content: [{ type: "text", text: JSON.stringify({ tx_hash: hash, from: account.address, to, amount }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "evm_transfer_erc20",
    {
      description: "Transfer ERC20 tokens on Flow EVM",
      inputSchema: {
        token_address: z.string().describe("ERC20 contract address"),
        to: z.string().describe("Destination address"),
        amount: z.string().describe("Amount in token units (e.g. '100.0')"),
        decimals: z.number().optional().describe("Token decimals (default 18)"),
      },
      annotations: { title: "EVM ERC20 Transfer", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ token_address, to, amount, decimals = 18 }) => {
      const account = getEvmAccount(ctx);
      if (!account) return { content: [{ type: "text", text: "No EVM key configured." }], isError: true };

      try {
        const chain = getChain(ctx.config.network);
        const walletClient = createWalletClient({ account, chain, transport: http() });
        const value = parseUnits(amount, decimals);
        const hash = await walletClient.writeContract({
          address: token_address as Address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [to as Address, value],
        });
        return { content: [{ type: "text", text: JSON.stringify({ tx_hash: hash, token: token_address, to, amount }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "evm_read_contract",
    {
      description: "Read a smart contract function on Flow EVM (no signing needed)",
      inputSchema: {
        contract_address: z.string().describe("Contract address"),
        abi: z.array(z.any()).describe("Contract ABI (JSON array)"),
        function_name: z.string().describe("Function name to call"),
        args: z.array(z.any()).optional().describe("Function arguments"),
      },
      annotations: { title: "EVM Read Contract", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ contract_address, abi, function_name, args = [] }) => {
      try {
        const client = getPublicClient(ctx.config.network);
        const result = await client.readContract({
          address: contract_address as Address,
          abi,
          functionName: function_name,
          args,
        });
        return { content: [{ type: "text", text: JSON.stringify({ result: String(result) }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "evm_write_contract",
    {
      description: "Write to a smart contract function on Flow EVM (requires signing)",
      inputSchema: {
        contract_address: z.string().describe("Contract address"),
        abi: z.array(z.any()).describe("Contract ABI (JSON array)"),
        function_name: z.string().describe("Function name to call"),
        args: z.array(z.any()).optional().describe("Function arguments"),
        value: z.string().optional().describe("FLOW value to send (e.g. '0.1')"),
      },
      annotations: { title: "EVM Write Contract", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ contract_address, abi, function_name, args = [], value }) => {
      const account = getEvmAccount(ctx);
      if (!account) return { content: [{ type: "text", text: "No EVM key configured." }], isError: true };

      try {
        const chain = getChain(ctx.config.network);
        const walletClient = createWalletClient({ account, chain, transport: http() });
        const hash = await walletClient.writeContract({
          address: contract_address as Address,
          abi,
          functionName: function_name,
          args,
          ...(value ? { value: parseEther(value) } : {}),
        });
        return { content: [{ type: "text", text: JSON.stringify({ tx_hash: hash }, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "evm_get_transaction",
    {
      description: "Get EVM transaction details by hash",
      inputSchema: { tx_hash: z.string().describe("Transaction hash") },
      annotations: { title: "EVM Get Transaction", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ tx_hash }) => {
      try {
        const client = getPublicClient(ctx.config.network);
        const tx = await client.getTransaction({ hash: tx_hash as Hex });
        return { content: [{ type: "text", text: JSON.stringify(tx, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    }
  );
}

// Minimal ERC20 ABI for balance/transfer
const ERC20_ABI = [
  { inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'decimals', outputs: [{ type: 'uint8' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'transfer', outputs: [{ type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
] as const;
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/src/tools/evm.ts
git commit -m "feat(agent-wallet): add EVM tools (balance, transfer, contract read/write)"
```

---

## Phase 7: README & Polish

### Task 15: Write README

**Files:**
- Create: `packages/agent-wallet/README.md`

**Step 1: Write README**

```markdown
# @flowindex/agent-wallet

MCP server that gives AI agents (Claude Code, Cursor, etc.) the ability to interact with the **Flow blockchain** and **Flow EVM**. Supports local signing, cloud wallet, and passkey-based transactions.

## Quick Start

### Zero Config (Cloud Wallet)

```json
{
  "mcpServers": {
    "flow-wallet": {
      "command": "npx",
      "args": ["@flowindex/agent-wallet"]
    }
  }
}
```

Then ask your AI agent: _"Log me in to my Flow wallet"_ — it will generate a login URL.

### Mnemonic (Flow + EVM)

```json
{
  "mcpServers": {
    "flow-wallet": {
      "command": "npx",
      "args": ["@flowindex/agent-wallet"],
      "env": {
        "FLOW_MNEMONIC": "your twelve word mnemonic phrase here ..."
      }
    }
  }
}
```

Derives both:
- **Flow account** via `m/44'/539'/0'/0/0` (secp256k1)
- **EVM EOA** via `m/44'/60'/0'/0/0`

### Private Key (Flow only)

```json
{
  "env": {
    "FLOW_PRIVATE_KEY": "your_private_key_hex"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLOW_NETWORK` | `mainnet` | `mainnet` or `testnet` |
| `FLOW_MNEMONIC` | — | BIP39 mnemonic (derives Flow + EVM keys) |
| `FLOW_PRIVATE_KEY` | — | Hex private key (Flow signing) |
| `EVM_PRIVATE_KEY` | — | Hex private key (EVM signing, falls back to mnemonic) |
| `FLOW_ADDRESS` | — | Explicit Flow signer address (auto-discovered if unset) |
| `FLOW_KEY_INDEX` | `0` | Flow account key index |
| `FLOW_SIG_ALGO` | `ECDSA_secp256k1` | Signature algorithm |
| `FLOW_HASH_ALGO` | `SHA2_256` | Hash algorithm |
| `EVM_ACCOUNT_INDEX` | `0` | BIP44 EVM derivation index |
| `FLOWINDEX_TOKEN` | — | Pre-authenticated cloud wallet JWT |
| `FLOWINDEX_URL` | `https://flowindex.io` | FlowIndex API URL |
| `APPROVAL_REQUIRED` | `true` | Set `false` for headless auto-signing |

## Available Tools

### Wallet (3)
- **`wallet_status`** — Current signer, addresses, network, approval mode
- **`wallet_login`** — Generate browser login URL for cloud wallet
- **`wallet_login_status`** — Check if browser login completed

### Cadence Templates (4)
- **`list_templates`** — Browse ~75 pre-vetted Cadence templates (token, NFT, EVM, bridge, staking)
- **`get_template`** — View template code and parameter schema
- **`execute_template`** — Sign and submit a template transaction
- **`execute_script`** — Run a read-only Cadence script

### Flow Queries (5)
- **`get_account`** — Account info, keys, contracts
- **`get_flow_balance`** — FLOW balance
- **`get_ft_balance`** — Fungible token balances
- **`get_nft_collection`** — NFT collections
- **`get_transaction`** — Transaction details

### EVM (8)
- **`evm_wallet_address`** — Current EOA address
- **`evm_get_balance`** — Native FLOW balance on EVM
- **`evm_get_token_balance`** — ERC20 balance
- **`evm_transfer`** — Send native FLOW on EVM
- **`evm_transfer_erc20`** — Send ERC20 tokens
- **`evm_read_contract`** — Read smart contract state
- **`evm_write_contract`** — Execute smart contract function
- **`evm_get_transaction`** — Transaction details

### Approval (3)
- **`confirm_transaction`** — Approve a pending transaction
- **`cancel_transaction`** — Reject a pending transaction
- **`list_pending`** — List queued transactions

## Signing Modes

| Mode | How | Headless? |
|------|-----|-----------|
| **Local Key** | wallet-core WASM, keys never leave process | Yes |
| **Cloud Custodial** | FlowIndex server-side signing via JWT | Yes |
| **Passkey** | Browser WebAuthn approval URL | No |

## Approval Flow

When `APPROVAL_REQUIRED=true` (default):

1. Agent calls `execute_template` → gets `pending_approval` status with summary
2. Agent shows user: _"Transfer 10 FLOW to 0x1234. Confirm?"_
3. User says yes → Agent calls `confirm_transaction`
4. Transaction is signed and submitted

When `APPROVAL_REQUIRED=false`:
- Transactions are signed and submitted immediately (headless mode)

## Template Categories

| Category | Count | Examples |
|----------|-------|---------|
| Token | 3 | Transfer FT, enable vault, check balance |
| NFT | 4 | Send NFT, batch send |
| EVM | 9 | Create COA, call contract, transfer to EVM |
| Bridge | 13 | Token/NFT bridging (Flow ↔ EVM) |
| HybridCustody | 28 | Parent/child account management |
| LostAndFound | 9 | Unclaimed asset recovery |

Templates sourced from [Flow Reference Wallet](https://github.com/onflow/FRW-monorepo/tree/dev/packages/cadence).

## Security

- Private keys and mnemonics **never leave the MCP server process**
- Keys loaded from environment variables only, never as tool arguments
- Template-based execution prevents arbitrary Cadence injection
- Approval flow gives users control over what gets signed
- All EVM signing done locally via viem

## Development

```bash
cd packages/agent-wallet
bun install
bun run dev          # Watch mode
bun run build        # Build for distribution
bun run inspect      # Test with MCP Inspector
```

## License

MIT
```

**Step 2: Commit**

```bash
git add packages/agent-wallet/README.md
git commit -m "docs(agent-wallet): add comprehensive README"
```

---

### Task 16: FCL configuration + verify build

**Files:**
- Create: `packages/agent-wallet/src/config/fcl.ts`

**Step 1: Create FCL config**

```typescript
import type { FlowNetwork } from './networks.js';
import { NETWORK_CONFIG } from './networks.js';

export async function configureFcl(network: FlowNetwork) {
  const fcl = await import('@onflow/fcl');
  const config = NETWORK_CONFIG[network];

  fcl.config()
    .put('accessNode.api', config.accessNode)
    .put('flow.network', network);

  // Set contract addresses
  for (const [name, address] of Object.entries(config.contracts)) {
    fcl.config().put(`0x${name}`, address);
  }
}
```

**Step 2: Add FCL init to server.ts**

Add at the top of `createServer()`:
```typescript
import { configureFcl } from '../config/fcl.js';
// ... inside createServer():
await configureFcl(config.network);
```

**Step 3: Run full lint + build**

Run: `cd packages/agent-wallet && bun run lint && bun run build`
Expected: Clean build

**Step 4: Commit**

```bash
git add packages/agent-wallet/
git commit -m "feat(agent-wallet): add FCL config, verify build"
```

---

### Task 17: Integration test with MCP Inspector

**Step 1: Build**

Run: `cd packages/agent-wallet && bun run build`

**Step 2: Test with MCP Inspector**

Run: `cd packages/agent-wallet && bun run inspect`

Verify:
- Server starts without errors
- `wallet_status` tool returns signer info
- `list_templates` returns template list
- `get_template` returns template details with code
- `evm_wallet_address` returns address (if mnemonic set)

**Step 3: Test with Claude Code config**

Add to `~/.claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "flow-wallet": {
      "command": "node",
      "args": ["/path/to/packages/agent-wallet/dist/index.js"],
      "env": {
        "FLOW_NETWORK": "testnet"
      }
    }
  }
}
```

Verify tools appear in Claude Code.

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Scaffolding, config, networks |
| 2 | 3-6 | Signer interface, local/cloud/passkey signers |
| 3 | 7-8 | MCP server setup, wallet tools |
| 4 | 9-11 | Cadence templates, registry, template tools |
| 5 | 12 | Approval manager |
| 6 | 13-14 | FlowIndex queries, EVM tools |
| 7 | 15-17 | README, FCL config, integration test |

Total: **17 tasks**, ~22 MCP tools, ~15 source files.
