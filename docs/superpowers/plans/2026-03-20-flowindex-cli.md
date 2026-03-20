# FlowIndex CLI — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FlowIndex CLI MVP — `flowindex tx`, `flowindex account`, `flowindex block`, `flowindex search` with Cadence/EVM auto-detection, table/JSON output, and config management.

**Architecture:** Two new packages: `packages/api-client/` (shared HTTP client for FlowIndex API, extracted from `agent-wallet`) and `packages/cli/` (Commander.js CLI that consumes the API client). The CLI auto-detects whether user input is a Flow address, EVM address, Cadence tx hash, or EVM tx hash by format, then calls the appropriate API endpoint.

**Tech Stack:** TypeScript, Commander.js, tsup (ESM), vitest, native fetch

**Spec:** `docs/superpowers/specs/2026-03-20-flowindex-cli-design.md`

---

## File Structure

### `packages/api-client/` — Shared FlowIndex API Client

| File | Responsibility |
|------|---------------|
| `src/client.ts` | `FlowIndexClient` class — all HTTP methods for FlowIndex API |
| `src/types.ts` | Response type interfaces (Block, Transaction, Account, SearchResult, etc.) |
| `src/errors.ts` | `FlowIndexApiError` custom error class with status, body |
| `src/index.ts` | Public re-exports |
| `test/client.test.ts` | Unit tests with mocked fetch |
| `package.json` | Package config — `@flowindex/api-client` |
| `tsup.config.ts` | ESM build config |
| `tsconfig.json` | TypeScript config |

### `packages/cli/` — CLI Application

| File | Responsibility |
|------|---------------|
| `src/cli.ts` | Entry point — Commander program setup, global flags, version |
| `src/commands/block.ts` | `flowindex block [height]` command |
| `src/commands/tx.ts` | `flowindex tx <hash>` command |
| `src/commands/account.ts` | `flowindex account <address>` command |
| `src/commands/search.ts` | `flowindex search <query>` command |
| `src/commands/config.ts` | `flowindex config set/get/list/reset` commands |
| `src/lib/detect.ts` | Input auto-detection (address type, tx hash type, etc.) |
| `src/lib/output.ts` | Output formatters (table, JSON, quiet mode) |
| `src/lib/config.ts` | Config file read/write (`~/.config/flowindex/config.json`) |
| `src/lib/errors.ts` | CLI error handling — catch API errors, format for terminal |
| `src/index.ts` | Programmatic API re-exports |
| `test/detect.test.ts` | Auto-detection unit tests |
| `test/output.test.ts` | Output formatter tests |
| `test/config.test.ts` | Config management tests |
| `test/commands/block.test.ts` | Block command tests |
| `test/commands/tx.test.ts` | Tx command tests |
| `test/commands/account.test.ts` | Account command tests |
| `test/commands/search.test.ts` | Search command tests |
| `package.json` | Package config — `@flowindex/cli`, bin: `flowindex` |
| `tsup.config.ts` | ESM build config with banner for shebang |
| `tsconfig.json` | TypeScript config |

---

## Task 1: Create `packages/api-client/` — Package Scaffold + Error Class

**Files:**
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/tsconfig.json`
- Create: `packages/api-client/tsup.config.ts`
- Create: `packages/api-client/src/errors.ts`
- Create: `packages/api-client/src/index.ts`
- Create: `packages/api-client/test/errors.test.ts`

- [ ] **Step 1: Write the failing test for FlowIndexApiError**

Create `packages/api-client/test/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FlowIndexApiError } from '../src/errors.js';

describe('FlowIndexApiError', () => {
  it('includes status and body in the error', () => {
    const err = new FlowIndexApiError(404, 'Not found', { detail: 'no such tx' });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('FlowIndex API error 404: Not found');
    expect(err.body).toEqual({ detail: 'no such tx' });
    expect(err.name).toBe('FlowIndexApiError');
  });

  it('works without body', () => {
    const err = new FlowIndexApiError(500, 'Internal Server Error');
    expect(err.status).toBe(500);
    expect(err.body).toBeUndefined();
  });
});
```

- [ ] **Step 2: Create package scaffold**

Create `packages/api-client/package.json`:

```json
{
  "name": "@flowindex/api-client",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "dev": "tsup --watch"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

Create `packages/api-client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Create `packages/api-client/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

- [ ] **Step 3: Implement FlowIndexApiError**

Create `packages/api-client/src/errors.ts`:

```ts
export class FlowIndexApiError extends Error {
  override name = 'FlowIndexApiError';

  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(`FlowIndex API error ${status}: ${message}`);
  }
}
```

Create `packages/api-client/src/index.ts`:

```ts
export { FlowIndexApiError } from './errors.js';
```

- [ ] **Step 4: Install deps at repo root (registers new workspace package) and run test**

```bash
bun install && cd packages/api-client && bun run test
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api-client/
git commit -m "feat(api-client): scaffold package with FlowIndexApiError"
```

---

## Task 2: API Client — Types + Core HTTP Methods

**Files:**
- Create: `packages/api-client/src/types.ts`
- Create: `packages/api-client/src/client.ts`
- Create: `packages/api-client/test/client.test.ts`
- Modify: `packages/api-client/src/index.ts`

- [ ] **Step 1: Define response types**

Create `packages/api-client/src/types.ts`:

```ts
// Block
export interface Block {
  height: number;
  id: string;
  parent_id: string;
  timestamp: string;
  tx_count: number;
  event_count: number;
  collection_count: number;
}

// Transaction
export interface Transaction {
  tx_id: string;
  block_height: number;
  block_id?: string;
  timestamp: string;
  status: string;
  status_code: number;
  error_message?: string;
  script?: string;
  arguments?: string[];
  authorizers?: string[];
  payer?: string;
  proposal_key_address?: string;
  gas_limit?: number;
  gas_used?: number;
  events?: TransactionEvent[];
  is_evm?: boolean;
  evm_hash?: string;
}

export interface TransactionEvent {
  type: string;
  transaction_id: string;
  transaction_index: number;
  event_index: number;
  value: string;
}

// EVM Transaction
export interface EvmTransaction {
  hash: string;
  block_height: number;
  timestamp: string;
  from_address: string;
  to_address?: string;
  value: string;
  gas_used: number;
  gas_price?: string;
  status: string;
  cadence_tx_id?: string;
  logs?: EvmLog[];
  internal_txs?: EvmInternalTx[];
  token_transfers?: EvmTokenTransfer[];
}

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  log_index: number;
}

export interface EvmInternalTx {
  from_address: string;
  to_address: string;
  value: string;
  call_type: string;
}

export interface EvmTokenTransfer {
  token_address: string;
  from_address: string;
  to_address: string;
  value: string;
  token_type: string;
}

// Account
export interface Account {
  address: string;
  balance: number;
  keys?: AccountKey[];
  contracts?: string[];
  is_contract?: boolean;
}

export interface AccountKey {
  index: number;
  public_key: string;
  sign_algo: string;
  hash_algo: string;
  weight: number;
  revoked: boolean;
}

// FT Holding
export interface FtHolding {
  token_type: string;
  token_name?: string;
  balance: string;
  usd_value?: number;
}

// NFT Collection
export interface NftCollection {
  collection_type: string;
  collection_name?: string;
  count: number;
}

// Search
export interface SearchResult {
  type: string; // "transaction" | "account" | "contract" | "token" | "nft" | "block"
  id: string;
  title: string;
  subtitle?: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

// List response wrapper
export interface ListResponse<T> {
  data: T[];
  hasMore?: boolean;
  total?: number;
}

// EVM Address
export interface EvmAddress {
  address: string;
  balance?: string;
  nonce?: number;
  is_contract?: boolean;
}

// Client config
export interface FlowIndexClientConfig {
  baseUrl?: string;
}
```

- [ ] **Step 2: Write failing test for client methods**

Create `packages/api-client/test/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FlowIndexClient } from '../src/client.js';
import { FlowIndexApiError } from '../src/errors.js';

// Mock global fetch
const mockFetch = vi.fn();

describe('FlowIndexClient', () => {
  let client: FlowIndexClient;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    client = new FlowIndexClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJsonResponse(data: unknown, status = 200) {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
      text: async () => JSON.stringify(data),
    });
  }

  describe('getBlock', () => {
    it('fetches latest block when no height given', async () => {
      const block = { height: 100, id: 'abc', timestamp: '2026-01-01T00:00:00Z', tx_count: 5 };
      mockJsonResponse({ data: [block], hasMore: true });
      const result = await client.getBlock();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/block?limit=1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(block);
    });

    it('fetches block by height', async () => {
      const block = { height: 42, id: 'def' };
      mockJsonResponse(block);
      const result = await client.getBlock(42);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/block/42',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(block);
    });
  });

  describe('getTransaction', () => {
    it('fetches a Cadence transaction', async () => {
      const tx = { tx_id: 'abc123', status: 'Sealed' };
      mockJsonResponse(tx);
      const result = await client.getTransaction('abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/transaction/abc123',
        expect.any(Object),
      );
      expect(result).toEqual(tx);
    });
  });

  describe('getEvmTransaction', () => {
    it('fetches an EVM transaction', async () => {
      const tx = { hash: '0xabc', from_address: '0x123' };
      mockJsonResponse(tx);
      const result = await client.getEvmTransaction('0xabc');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/evm/transaction/0xabc',
        expect.any(Object),
      );
      expect(result).toEqual(tx);
    });
  });

  describe('getAccount', () => {
    it('fetches a Flow account', async () => {
      const acct = { address: 'e467b9dd11fa00df', balance: 100 };
      mockJsonResponse(acct);
      const result = await client.getAccount('e467b9dd11fa00df');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/account/e467b9dd11fa00df',
        expect.any(Object),
      );
      expect(result).toEqual(acct);
    });
  });

  describe('getEvmAddress', () => {
    it('fetches an EVM address', async () => {
      const addr = { address: '0x1234abcd', balance: '1000000' };
      mockJsonResponse(addr);
      const result = await client.getEvmAddress('0x1234abcd');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/evm/address/0x1234abcd',
        expect.any(Object),
      );
      expect(result).toEqual(addr);
    });
  });

  describe('search', () => {
    it('searches with query', async () => {
      const results = { results: [{ type: 'account', id: '0x1', title: 'Test' }] };
      mockJsonResponse(results);
      const result = await client.search('FlowToken');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/search?q=FlowToken',
        expect.any(Object),
      );
      expect(result).toEqual(results);
    });
  });

  describe('error handling', () => {
    it('throws FlowIndexApiError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not found',
        headers: { get: () => 'text/plain' },
      });
      await expect(client.getBlock(999999999)).rejects.toThrow(FlowIndexApiError);
    });
  });

  describe('getAccountFtHoldings', () => {
    it('fetches FT holdings for an account', async () => {
      const holdings = { data: [{ token_type: 'FlowToken', balance: '100.0' }] };
      mockJsonResponse(holdings);
      const result = await client.getAccountFtHoldings('e467b9dd11fa00df');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/account/e467b9dd11fa00df/ft',
        expect.any(Object),
      );
      expect(result).toEqual(holdings);
    });
  });

  describe('getAccountNftCollections', () => {
    it('fetches NFT collections for an account', async () => {
      const nfts = { data: [{ collection_type: 'TopShot', count: 5 }] };
      mockJsonResponse(nfts);
      const result = await client.getAccountNftCollections('e467b9dd11fa00df');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.flowindex.io/flow/account/e467b9dd11fa00df/nft',
        expect.any(Object),
      );
      expect(result).toEqual(nfts);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/api-client && bun run test
```

Expected: FAIL — `FlowIndexClient` not found.

- [ ] **Step 4: Implement FlowIndexClient**

Create `packages/api-client/src/client.ts`:

```ts
import { FlowIndexApiError } from './errors.js';
import type {
  FlowIndexClientConfig,
  Block,
  Transaction,
  EvmTransaction,
  Account,
  EvmAddress,
  SearchResponse,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.flowindex.io';

export class FlowIndexClient {
  private readonly baseUrl: string;

  constructor(config?: FlowIndexClientConfig) {
    this.baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, { method: 'GET' });

    if (!resp.ok) {
      const text = await resp.text();
      throw new FlowIndexApiError(resp.status, text);
    }

    return resp.json() as Promise<T>;
  }

  async getBlock(height?: number): Promise<Block> {
    if (height != null) {
      return this.request<Block>(`/flow/block/${height}`);
    }
    // /flow/block returns a list — fetch latest by requesting limit=1
    const list = await this.request<{ data: Block[] }>('/flow/block?limit=1');
    if (!list.data || list.data.length === 0) {
      throw new FlowIndexApiError(404, 'No blocks found');
    }
    return list.data[0];
  }

  async getTransaction(txId: string): Promise<Transaction> {
    return this.request<Transaction>(`/flow/transaction/${txId}`);
  }

  async getEvmTransaction(hash: string): Promise<EvmTransaction> {
    return this.request<EvmTransaction>(`/flow/evm/transaction/${hash}`);
  }

  async getAccount(address: string): Promise<Account> {
    return this.request<Account>(`/flow/account/${address}`);
  }

  async getEvmAddress(address: string): Promise<EvmAddress> {
    return this.request<EvmAddress>(`/flow/evm/address/${address}`);
  }

  async getAccountFtHoldings(address: string): Promise<unknown> {
    return this.request(`/flow/account/${address}/ft`);
  }

  async getAccountNftCollections(address: string): Promise<unknown> {
    return this.request(`/flow/account/${address}/nft`);
  }

  async getAccountTransfers(address: string, limit = 20, offset = 0): Promise<unknown> {
    return this.request(`/flow/account/${address}/transfer?limit=${limit}&offset=${offset}`);
  }

  async search(query: string, type?: string): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query });
    if (type) params.set('type', type);
    return this.request<SearchResponse>(`/flow/search?${params}`);
  }
}
```

- [ ] **Step 5: Update index.ts exports**

Update `packages/api-client/src/index.ts`:

```ts
export { FlowIndexClient } from './client.js';
export { FlowIndexApiError } from './errors.js';
export type * from './types.js';
```

- [ ] **Step 6: Run tests**

```bash
cd packages/api-client && bun run test
```

Expected: PASS — all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/api-client/
git commit -m "feat(api-client): add FlowIndexClient with block, tx, account, search methods"
```

---

## Task 3: CLI Package Scaffold

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/src/cli.ts`
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@flowindex/cli",
  "version": "0.1.0",
  "type": "module",
  "description": "FlowIndex CLI — query Flow blockchain data from the terminal",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "flowindex": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "@flowindex/api-client": "workspace:*",
    "commander": "^13.1.0"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Create tsup.config.ts**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: ['esm'],
  dts: { entry: ['src/index.ts'] },
  clean: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

Note: The shebang `#!/usr/bin/env node` is added to all JS output files. This is harmless for `index.js` (imported as a module, shebang is treated as a comment) and required for `cli.js` (executed directly).

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create cli.ts entry point**

Create `packages/cli/src/cli.ts`:

```ts
import { Command } from 'commander';

const program = new Command();

program
  .name('flowindex')
  .description('FlowIndex CLI — query Flow blockchain data from the terminal')
  .version('0.1.0');

// Global options
program
  .option('--format <format>', 'output format: table, json, csv', 'table')
  .option('--quiet', 'minimal output')
  .option('--no-color', 'disable colored output');

program.parse();
```

Create `packages/cli/src/index.ts`:

```ts
// Programmatic API — re-export api-client for convenience
export { FlowIndexClient, FlowIndexApiError } from '@flowindex/api-client';
```

- [ ] **Step 5: Install deps at repo root (registers new workspace packages), build, and verify CLI runs**

```bash
bun install && cd packages/cli && bun run build && node dist/cli.js --help
```

Expected: Shows help text with `flowindex` name, description, version, and global options.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/
git commit -m "feat(cli): scaffold CLI package with Commander.js"
```

---

## Task 4: Input Auto-Detection (`lib/detect.ts`)

**Files:**
- Create: `packages/cli/src/lib/detect.ts`
- Create: `packages/cli/test/detect.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/detect.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectInputType, InputType } from '../src/lib/detect.js';

describe('detectInputType', () => {
  // Flow tx hash — 64 hex chars, no 0x prefix
  it('detects Flow transaction hash', () => {
    const hash = 'a'.repeat(64);
    expect(detectInputType(hash)).toEqual({ type: InputType.FlowTxHash, value: hash });
  });

  // EVM tx hash — 0x + 64 hex chars
  it('detects EVM transaction hash', () => {
    const hash = '0x' + 'a'.repeat(64);
    expect(detectInputType(hash)).toEqual({ type: InputType.EvmTxHash, value: hash });
  });

  // Flow address — 16 hex chars, no 0x
  it('detects Flow address', () => {
    const addr = 'e467b9dd11fa00df';
    expect(detectInputType(addr)).toEqual({ type: InputType.FlowAddress, value: addr });
  });

  // Flow address with 0x prefix — strip it
  it('detects Flow address with 0x prefix', () => {
    const addr = '0xe467b9dd11fa00df';
    expect(detectInputType(addr)).toEqual({ type: InputType.FlowAddress, value: 'e467b9dd11fa00df' });
  });

  // EVM address — 0x + 40 hex chars
  it('detects EVM address', () => {
    const addr = '0x' + 'a'.repeat(40);
    expect(detectInputType(addr)).toEqual({ type: InputType.EvmAddress, value: addr });
  });

  // .find name
  it('detects .find name', () => {
    expect(detectInputType('hao.find')).toEqual({ type: InputType.FlowName, value: 'hao.find' });
  });

  // .fn name
  it('detects .fn name', () => {
    expect(detectInputType('alice.fn')).toEqual({ type: InputType.FlowName, value: 'alice.fn' });
  });

  // Numeric — block height
  it('detects block height', () => {
    expect(detectInputType('85000000')).toEqual({ type: InputType.BlockHeight, value: 85000000 });
  });

  // Fallback — search query
  it('falls back to search query', () => {
    expect(detectInputType('FlowToken')).toEqual({ type: InputType.SearchQuery, value: 'FlowToken' });
  });

  // Mixed case hex should work
  it('handles mixed case hex', () => {
    const hash = 'aAbBcCdD'.repeat(8); // 64 chars
    expect(detectInputType(hash)).toEqual({ type: InputType.FlowTxHash, value: hash.toLowerCase() });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && bun run test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement detect.ts**

Create `packages/cli/src/lib/detect.ts`:

```ts
export enum InputType {
  FlowTxHash = 'flow_tx_hash',
  EvmTxHash = 'evm_tx_hash',
  FlowAddress = 'flow_address',
  EvmAddress = 'evm_address',
  FlowName = 'flow_name',
  BlockHeight = 'block_height',
  SearchQuery = 'search_query',
}

export interface DetectedInput {
  type: InputType;
  value: string | number;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

export function detectInputType(input: string): DetectedInput {
  const trimmed = input.trim();

  // .find or .fn name
  if (trimmed.endsWith('.find') || trimmed.endsWith('.fn')) {
    return { type: InputType.FlowName, value: trimmed };
  }

  // Numeric — block height
  if (/^\d+$/.test(trimmed)) {
    return { type: InputType.BlockHeight, value: parseInt(trimmed, 10) };
  }

  // 0x-prefixed
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const hex = trimmed.slice(2);

    if (!HEX_RE.test(hex)) {
      return { type: InputType.SearchQuery, value: trimmed };
    }

    // 0x + 64 hex = EVM tx hash
    if (hex.length === 64) {
      return { type: InputType.EvmTxHash, value: trimmed.toLowerCase() };
    }

    // 0x + 40 hex = EVM address
    if (hex.length === 40) {
      return { type: InputType.EvmAddress, value: trimmed.toLowerCase() };
    }

    // 0x + 16 hex = Flow address with 0x prefix
    if (hex.length === 16) {
      return { type: InputType.FlowAddress, value: hex.toLowerCase() };
    }

    return { type: InputType.SearchQuery, value: trimmed };
  }

  // No 0x prefix, pure hex
  if (HEX_RE.test(trimmed)) {
    // 64 hex = Flow tx hash
    if (trimmed.length === 64) {
      return { type: InputType.FlowTxHash, value: trimmed.toLowerCase() };
    }

    // 16 hex = Flow address
    if (trimmed.length === 16) {
      return { type: InputType.FlowAddress, value: trimmed.toLowerCase() };
    }
  }

  // Fallback — search query
  return { type: InputType.SearchQuery, value: trimmed };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && bun run test
```

Expected: PASS — all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/detect.ts packages/cli/test/detect.test.ts
git commit -m "feat(cli): add input auto-detection for Flow/EVM addresses and tx hashes"
```

---

## Task 5: Config Management (`lib/config.ts`)

**Files:**
- Create: `packages/cli/src/lib/config.ts`
- Create: `packages/cli/test/config.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfig, saveConfig, getConfigDir, resetConfig, type CliConfig } from '../src/lib/config.js';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('config', () => {
  let tmpDir: string;
  const originalEnv = process.env;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'flowindex-cli-test-'));
    process.env = { ...originalEnv, XDG_CONFIG_HOME: tmpDir };
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  it('returns default config when no file exists', () => {
    const config = loadConfig();
    expect(config.outputFormat).toBe('table');
    expect(config.color).toBe(true);
    expect(config.network).toBe('mainnet');
  });

  it('saves and loads config', () => {
    saveConfig({ outputFormat: 'json', color: false, network: 'mainnet' });
    const config = loadConfig();
    expect(config.outputFormat).toBe('json');
    expect(config.color).toBe(false);
  });

  it('merges partial saves with defaults', () => {
    saveConfig({ outputFormat: 'csv' } as CliConfig);
    const config = loadConfig();
    expect(config.outputFormat).toBe('csv');
    expect(config.color).toBe(true); // default preserved
  });

  it('resets to defaults', () => {
    saveConfig({ outputFormat: 'json', color: false, network: 'mainnet' });
    resetConfig();
    const config = loadConfig();
    expect(config.outputFormat).toBe('table');
  });

  it('respects XDG_CONFIG_HOME', () => {
    const dir = getConfigDir();
    expect(dir).toBe(join(tmpDir, 'flowindex'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && bun run test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement config.ts**

Create `packages/cli/src/lib/config.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface CliConfig {
  outputFormat: 'table' | 'json' | 'csv';
  color: boolean;
  network: 'mainnet' | 'testnet';
}

const DEFAULT_CONFIG: CliConfig = {
  outputFormat: 'table',
  color: true,
  network: 'mainnet',
};

export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg || join(homedir(), '.config');
  return join(base, 'flowindex');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export function loadConfig(): CliConfig {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Partial<CliConfig>): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2) + '\n');
}

export function resetConfig(): void {
  const dir = getConfigDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(getConfigPath(), JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && bun run test
```

Expected: PASS — all 5 config tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/config.ts packages/cli/test/config.test.ts
git commit -m "feat(cli): add config management with XDG support"
```

---

## Task 6: Output Formatting (`lib/output.ts`)

**Files:**
- Create: `packages/cli/src/lib/output.ts`
- Create: `packages/cli/test/output.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/output.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatKeyValue, formatTable, formatJson, formatOutput } from '../src/lib/output.js';

describe('output', () => {
  describe('formatKeyValue', () => {
    it('formats key-value pairs', () => {
      const output = formatKeyValue([
        ['Status', 'Sealed'],
        ['Block', '85,234,567'],
      ]);
      expect(output).toContain('Status');
      expect(output).toContain('Sealed');
      expect(output).toContain('Block');
      expect(output).toContain('85,234,567');
    });
  });

  describe('formatTable', () => {
    it('formats array data as table', () => {
      const output = formatTable(
        ['Name', 'Balance'],
        [
          ['FlowToken', '100.0'],
          ['USDC', '50.0'],
        ],
      );
      expect(output).toContain('Name');
      expect(output).toContain('Balance');
      expect(output).toContain('FlowToken');
      expect(output).toContain('100.0');
    });

    it('handles empty data', () => {
      const output = formatTable(['Name'], []);
      expect(output).toContain('No results');
    });
  });

  describe('formatJson', () => {
    it('formats data as indented JSON', () => {
      const data = { key: 'value' };
      const output = formatJson(data);
      expect(output).toBe(JSON.stringify(data, null, 2));
    });
  });

  describe('formatOutput', () => {
    it('returns JSON when format is json', () => {
      const data = { key: 'value' };
      const output = formatOutput(data, 'json');
      expect(output).toBe(JSON.stringify(data, null, 2));
    });

    it('returns key-value for object with format table', () => {
      const data = { Status: 'Sealed', Block: 85234567 };
      const output = formatOutput(data, 'table');
      expect(output).toContain('Status');
      expect(output).toContain('Sealed');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/cli && bun run test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement output.ts**

Create `packages/cli/src/lib/output.ts`:

```ts
/**
 * Format key-value pairs as aligned columns.
 *
 *   Status       Sealed
 *   Block        85,234,567
 */
export function formatKeyValue(pairs: [string, string][]): string {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  return pairs
    .map(([key, value]) => `  ${key.padEnd(maxKeyLen + 2)}${value}`)
    .join('\n');
}

/**
 * Format data as a simple text table with headers.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No results.';
  }

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');
  const separator = colWidths.map((w) => '-'.repeat(w)).join('  ');
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell ?? '').padEnd(colWidths[i])).join('  '),
  );

  return [headerLine, separator, ...dataLines].join('\n');
}

/**
 * Format data as indented JSON.
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Smart output formatter — picks format based on data shape and format flag.
 */
export function formatOutput(
  data: unknown,
  format: 'table' | 'json' | 'csv' = 'table',
): string {
  if (format === 'json') {
    return formatJson(data);
  }

  // For objects, render as key-value
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const entries = Object.entries(data as Record<string, unknown>);
    const pairs: [string, string][] = entries.map(([k, v]) => [k, String(v)]);
    return formatKeyValue(pairs);
  }

  // For arrays, render as table
  if (Array.isArray(data) && data.length > 0) {
    const headers = Object.keys(data[0]);
    const rows = data.map((item) => headers.map((h) => String(item[h] ?? '')));
    return formatTable(headers, rows);
  }

  return formatJson(data);
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/cli && bun run test
```

Expected: PASS — all 5 output tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/output.ts packages/cli/test/output.test.ts
git commit -m "feat(cli): add output formatters (table, JSON, key-value)"
```

---

## Task 7: Error Handling (`lib/errors.ts`)

**Files:**
- Create: `packages/cli/src/lib/errors.ts`

- [ ] **Step 1: Implement errors.ts**

Create `packages/cli/src/lib/errors.ts`:

```ts
import { FlowIndexApiError } from '@flowindex/api-client';

/**
 * Wrap a command handler to catch errors and print user-friendly messages.
 * Exits with code 1 on error.
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<void>>(
  handler: T,
): (...args: Parameters<T>) => Promise<void> {
  return async (...args: Parameters<T>) => {
    try {
      await handler(...args);
    } catch (err) {
      if (err instanceof FlowIndexApiError) {
        if (err.status === 404) {
          console.error('Not found. Check the address, transaction hash, or block height.');
        } else if (err.status === 429) {
          console.error('Rate limited. Try again in a moment, or use `flowindex auth login` for higher limits.');
        } else {
          console.error(`API error (${err.status}): ${err.message}`);
        }
      } else if (err instanceof Error) {
        console.error(`Error: ${err.message}`);
      } else {
        console.error('An unexpected error occurred.');
      }
      process.exit(1);
    }
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/lib/errors.ts
git commit -m "feat(cli): add error handling wrapper for commands"
```

---

## Task 8: `flowindex block` Command

**Files:**
- Create: `packages/cli/src/commands/block.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Implement block command**

Create `packages/cli/src/commands/block.ts`:

```ts
import { Command } from 'commander';
import { FlowIndexClient } from '@flowindex/api-client';
import { formatKeyValue, formatJson, formatOutput } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

export function registerBlockCommand(program: Command): void {
  program
    .command('block [height]')
    .description('Show block details. Default: latest block.')
    .option('--txs', 'include transaction list')
    .action(
      withErrorHandling(async (height: string | undefined, opts: { txs?: boolean }) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        let blockHeight: number | undefined;
        if (height != null) {
          blockHeight = parseInt(height, 10);
          if (isNaN(blockHeight)) {
            console.error(`Invalid block height: "${height}". Must be a number.`);
            process.exit(1);
          }
        }
        const block = await client.getBlock(blockHeight);

        if (format === 'json') {
          console.log(formatJson(block));
          return;
        }

        const b = block as Record<string, unknown>;
        console.log(`Block ${b.height}\n`);
        console.log(
          formatKeyValue([
            ['ID', String(b.id ?? '')],
            ['Parent ID', String(b.parent_id ?? '')],
            ['Timestamp', String(b.timestamp ?? '')],
            ['Transactions', String(b.tx_count ?? 0)],
            ['Events', String(b.event_count ?? 0)],
            ['Collections', String(b.collection_count ?? 0)],
          ]),
        );
      }),
    );
}
```

- [ ] **Step 2: Wire up in cli.ts**

Update `packages/cli/src/cli.ts`:

```ts
import { Command } from 'commander';
import { registerBlockCommand } from './commands/block.js';

const program = new Command();

program
  .name('flowindex')
  .description('FlowIndex CLI — query Flow blockchain data from the terminal')
  .version('0.1.0');

program
  .option('--format <format>', 'output format: table, json, csv', 'table')
  .option('--quiet', 'minimal output')
  .option('--no-color', 'disable colored output');

registerBlockCommand(program);

program.parse();
```

- [ ] **Step 3: Build and test manually**

```bash
cd packages/cli && bun run build && node dist/cli.js block --help
```

Expected: Shows help for `block` command with `[height]` argument and `--txs` option.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/block.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add 'flowindex block' command"
```

---

## Task 9: `flowindex tx` Command

**Files:**
- Create: `packages/cli/src/commands/tx.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Implement tx command**

Create `packages/cli/src/commands/tx.ts`:

```ts
import { Command } from 'commander';
import { FlowIndexClient, FlowIndexApiError } from '@flowindex/api-client';
import { detectInputType, InputType } from '../lib/detect.js';
import { formatKeyValue, formatJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

export function registerTxCommand(program: Command): void {
  program
    .command('tx <hash>')
    .description('Show transaction details. Auto-detects Cadence or EVM hash.')
    .option('--events', 'show full event details')
    .action(
      withErrorHandling(async (hash: string, opts: { events?: boolean }) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        const detected = detectInputType(hash);

        let tx: Record<string, unknown> | null = null;
        let isEvm = false;

        if (detected.type === InputType.EvmTxHash) {
          // Try EVM first
          try {
            tx = (await client.getEvmTransaction(String(detected.value))) as Record<string, unknown>;
            isEvm = true;
          } catch (err) {
            if (err instanceof FlowIndexApiError && err.status === 404) {
              // Fallback: try as Flow tx (strip 0x)
              const flowHash = String(detected.value).slice(2);
              tx = (await client.getTransaction(flowHash)) as Record<string, unknown>;
            } else {
              throw err;
            }
          }
        } else {
          // Flow tx hash or other
          tx = (await client.getTransaction(String(detected.value))) as Record<string, unknown>;
          isEvm = !!(tx as any)?.is_evm;
        }

        if (format === 'json') {
          console.log(formatJson(tx));
          return;
        }

        if (isEvm) {
          printEvmTx(tx!);
        } else {
          printFlowTx(tx!, opts.events);
        }
      }),
    );
}

function printFlowTx(tx: Record<string, unknown>, showEvents?: boolean): void {
  console.log(`Transaction ${tx.tx_id}\n`);
  console.log(
    formatKeyValue([
      ['Status', String(tx.status ?? '')],
      ['Block', String(tx.block_height ?? '')],
      ['Timestamp', String(tx.timestamp ?? '')],
      ['Payer', String(tx.payer ?? '')],
      ['Authorizers', String((tx.authorizers as string[])?.join(', ') ?? '')],
      ['Gas Used', String(tx.gas_used ?? '')],
    ]),
  );

  if (tx.is_evm && tx.evm_hash) {
    console.log(`\n  EVM Hash     ${tx.evm_hash}`);
  }

  const events = tx.events as Array<Record<string, unknown>> | undefined;
  if (events && events.length > 0) {
    console.log(`\n  Events (${events.length})`);
    const lastIdx = events.length - 1;
    events.forEach((evt, i) => {
      const prefix = i === lastIdx ? '  └─' : '  ├─';
      const type = String(evt.type ?? '');
      const shortType = type.split('.').slice(-2).join('.');
      if (showEvents) {
        console.log(`${prefix} ${shortType}`);
        console.log(`       ${evt.value ?? ''}`);
      } else {
        console.log(`${prefix} ${shortType}`);
      }
    });
  }
}

function printEvmTx(tx: Record<string, unknown>): void {
  console.log(`EVM Transaction ${tx.hash}\n`);
  console.log(
    formatKeyValue([
      ['Status', String(tx.status ?? '')],
      ['Block', String(tx.block_height ?? '')],
      ['Timestamp', String(tx.timestamp ?? '')],
      ['From', String(tx.from_address ?? '')],
      ['To', String(tx.to_address ?? '')],
      ['Value', String(tx.value ?? '0')],
      ['Gas Used', String(tx.gas_used ?? '')],
    ]),
  );

  if (tx.cadence_tx_id) {
    console.log(`\n  Cadence TX   ${tx.cadence_tx_id}`);
  }
}
```

- [ ] **Step 2: Register in cli.ts**

Add to `packages/cli/src/cli.ts` after the block import:

```ts
import { registerTxCommand } from './commands/tx.js';
// ... after registerBlockCommand(program):
registerTxCommand(program);
```

- [ ] **Step 3: Build and test**

```bash
cd packages/cli && bun run build && node dist/cli.js tx --help
```

Expected: Shows help for `tx` command with `<hash>` argument and `--events` option.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/tx.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add 'flowindex tx' command with Cadence/EVM auto-detection"
```

---

## Task 10: `flowindex account` Command

**Files:**
- Create: `packages/cli/src/commands/account.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Implement account command**

Create `packages/cli/src/commands/account.ts`:

```ts
import { Command } from 'commander';
import { FlowIndexClient } from '@flowindex/api-client';
import { detectInputType, InputType } from '../lib/detect.js';
import { formatKeyValue, formatTable, formatJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

interface AccountOpts {
  transfers?: boolean;
  ft?: boolean;
  nft?: boolean;
  contracts?: boolean;
  keys?: boolean;
  limit?: string;
}

export function registerAccountCommand(program: Command): void {
  program
    .command('account <address>')
    .description('Account overview. Auto-detects Flow or EVM address.')
    .option('--transfers', 'show recent transfers')
    .option('--ft', 'show FT holdings')
    .option('--nft', 'show NFT holdings')
    .option('--contracts', 'show deployed contracts')
    .option('--keys', 'show account keys')
    .option('--limit <n>', 'limit results', '20')
    .action(
      withErrorHandling(async (address: string, opts: AccountOpts) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        const detected = detectInputType(address);

        if (detected.type === InputType.EvmAddress) {
          const data = await client.getEvmAddress(String(detected.value));
          if (format === 'json') {
            console.log(formatJson(data));
          } else {
            printEvmAddress(data as Record<string, unknown>);
          }
          return;
        }

        // Flow address (or resolved name — name resolution is Phase 2)
        const addr =
          detected.type === InputType.FlowAddress ? String(detected.value) : address;

        const account = (await client.getAccount(addr)) as Record<string, unknown>;

        if (format === 'json') {
          console.log(formatJson(account));
          return;
        }

        printFlowAccount(account);

        // Sub-queries
        if (opts.ft) {
          const ft = (await client.getAccountFtHoldings(addr)) as Record<string, unknown>;
          console.log('\n  FT Holdings');
          const items = (ft as any)?.data ?? ft;
          if (Array.isArray(items) && items.length > 0) {
            console.log(
              formatTable(
                ['Token', 'Balance', 'USD Value'],
                items.map((t: any) => [
                  t.token_name || t.token_type || '',
                  t.balance || '0',
                  t.usd_value != null ? `$${t.usd_value}` : '-',
                ]),
              ),
            );
          } else {
            console.log('  No FT holdings found.');
          }
        }

        if (opts.nft) {
          const nft = (await client.getAccountNftCollections(addr)) as Record<string, unknown>;
          console.log('\n  NFT Collections');
          const items = (nft as any)?.data ?? nft;
          if (Array.isArray(items) && items.length > 0) {
            console.log(
              formatTable(
                ['Collection', 'Count'],
                items.map((c: any) => [c.collection_name || c.collection_type || '', String(c.count || 0)]),
              ),
            );
          } else {
            console.log('  No NFT collections found.');
          }
        }

        if (opts.transfers) {
          const limit = parseInt(opts.limit || '20', 10);
          const transfers = (await client.getAccountTransfers(addr, limit)) as Record<string, unknown>;
          console.log('\n  Recent Transfers');
          const items = (transfers as any)?.data ?? transfers;
          if (Array.isArray(items) && items.length > 0) {
            console.log(
              formatTable(
                ['TX ID', 'Type', 'Amount', 'Timestamp'],
                items.map((t: any) => [
                  (t.tx_id || '').slice(0, 16) + '...',
                  t.type || '',
                  t.amount || '',
                  t.timestamp || '',
                ]),
              ),
            );
          } else {
            console.log('  No transfers found.');
          }
        }
      }),
    );
}

function printFlowAccount(acct: Record<string, unknown>): void {
  console.log(`Account ${acct.address}\n`);
  const pairs: [string, string][] = [
    ['Balance', `${acct.balance ?? 0} FLOW`],
  ];
  if (acct.contracts && Array.isArray(acct.contracts) && acct.contracts.length > 0) {
    pairs.push(['Contracts', acct.contracts.join(', ')]);
  }
  if (acct.is_contract) {
    pairs.push(['Is Contract', 'Yes']);
  }
  console.log(formatKeyValue(pairs));

  const keys = acct.keys as Array<Record<string, unknown>> | undefined;
  if (keys && keys.length > 0) {
    console.log(`\n  Keys (${keys.length})`);
    keys.forEach((k) => {
      const status = k.revoked ? ' [REVOKED]' : '';
      console.log(`  - #${k.index} weight=${k.weight} ${k.sign_algo}/${k.hash_algo}${status}`);
    });
  }
}

function printEvmAddress(data: Record<string, unknown>): void {
  console.log(`EVM Address ${data.address}\n`);
  console.log(
    formatKeyValue([
      ['Balance', String(data.balance ?? '0')],
      ['Is Contract', data.is_contract ? 'Yes' : 'No'],
    ]),
  );
}
```

- [ ] **Step 2: Register in cli.ts**

Add to `packages/cli/src/cli.ts`:

```ts
import { registerAccountCommand } from './commands/account.js';
// ... after registerTxCommand(program):
registerAccountCommand(program);
```

- [ ] **Step 3: Build and test**

```bash
cd packages/cli && bun run build && node dist/cli.js account --help
```

Expected: Shows help for `account` command with options.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/account.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add 'flowindex account' command with Flow/EVM support"
```

---

## Task 11: `flowindex search` Command

**Files:**
- Create: `packages/cli/src/commands/search.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Implement search command**

Create `packages/cli/src/commands/search.ts`:

```ts
import { Command } from 'commander';
import { FlowIndexClient } from '@flowindex/api-client';
import { formatTable, formatJson } from '../lib/output.js';
import { withErrorHandling } from '../lib/errors.js';

export function registerSearchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search across transactions, accounts, contracts, tokens.')
    .option('--type <type>', 'filter by type: tx, account, contract, token, nft, block, node')
    .option('--limit <n>', 'limit results', '20')
    .action(
      withErrorHandling(async (query: string, opts: { type?: string; limit?: string }) => {
        const format = program.opts().format ?? 'table';
        const client = new FlowIndexClient();
        const results = await client.search(query, opts.type);

        if (format === 'json') {
          console.log(formatJson(results));
          return;
        }

        const items = results.results ?? [];
        if (items.length === 0) {
          console.log('No results found.');
          return;
        }

        console.log(`Search results for "${query}"\n`);
        console.log(
          formatTable(
            ['Type', 'ID', 'Title', 'Details'],
            items.map((r) => [
              r.type,
              r.id.length > 20 ? r.id.slice(0, 20) + '...' : r.id,
              r.title,
              r.subtitle ?? '',
            ]),
          ),
        );
      }),
    );
}
```

- [ ] **Step 2: Register in cli.ts**

Add to `packages/cli/src/cli.ts`:

```ts
import { registerSearchCommand } from './commands/search.js';
// ... after registerAccountCommand(program):
registerSearchCommand(program);
```

- [ ] **Step 3: Build and test**

```bash
cd packages/cli && bun run build && node dist/cli.js search --help
```

Expected: Shows help for `search` command.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/search.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add 'flowindex search' command"
```

---

## Task 12: `flowindex config` Commands

**Files:**
- Create: `packages/cli/src/commands/config.ts`
- Modify: `packages/cli/src/cli.ts`

- [ ] **Step 1: Implement config commands**

Create `packages/cli/src/commands/config.ts`:

```ts
import { Command } from 'commander';
import { loadConfig, saveConfig, resetConfig, type CliConfig } from '../lib/config.js';
import { formatKeyValue, formatJson } from '../lib/output.js';

const VALID_KEYS: Record<string, string> = {
  'output-format': 'outputFormat',
  color: 'color',
  network: 'network',
};

export function registerConfigCommand(program: Command): void {
  const config = program.command('config').description('Manage CLI configuration');

  config
    .command('set <key> <value>')
    .description('Set a config value. Keys: output-format, color, network')
    .action((key: string, value: string) => {
      const configKey = VALID_KEYS[key];
      if (!configKey) {
        console.error(`Unknown config key: ${key}. Valid keys: ${Object.keys(VALID_KEYS).join(', ')}`);
        process.exit(1);
      }

      let parsedValue: unknown = value;
      if (key === 'color') {
        parsedValue = value === 'true';
      }
      if (key === 'output-format' && !['table', 'json', 'csv'].includes(value)) {
        console.error('output-format must be one of: table, json, csv');
        process.exit(1);
      }
      if (key === 'network' && !['mainnet', 'testnet'].includes(value)) {
        console.error('network must be one of: mainnet, testnet');
        process.exit(1);
      }

      saveConfig({ [configKey]: parsedValue } as Partial<CliConfig>);
      console.log(`Set ${key} = ${value}`);
    });

  config
    .command('get <key>')
    .description('Get a config value')
    .action((key: string) => {
      const configKey = VALID_KEYS[key];
      if (!configKey) {
        console.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
      const cfg = loadConfig();
      console.log((cfg as any)[configKey]);
    });

  config
    .command('list')
    .description('Show all config values')
    .action(() => {
      const format = program.opts().format ?? 'table';
      const cfg = loadConfig();
      if (format === 'json') {
        console.log(formatJson(cfg));
      } else {
        console.log(
          formatKeyValue([
            ['output-format', cfg.outputFormat],
            ['color', String(cfg.color)],
            ['network', cfg.network],
          ]),
        );
      }
    });

  config
    .command('reset')
    .description('Reset config to defaults')
    .action(() => {
      resetConfig();
      console.log('Config reset to defaults.');
    });
}
```

- [ ] **Step 2: Register in cli.ts**

Add to `packages/cli/src/cli.ts`:

```ts
import { registerConfigCommand } from './commands/config.js';
// ... after registerSearchCommand(program):
registerConfigCommand(program);
```

- [ ] **Step 3: Build and test**

```bash
cd packages/cli && bun run build
node dist/cli.js config --help
node dist/cli.js config list
node dist/cli.js config set output-format json
node dist/cli.js config get output-format
node dist/cli.js config reset
```

Expected: All config subcommands work. `list` shows defaults. `set` + `get` roundtrips. `reset` restores defaults.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/config.ts packages/cli/src/cli.ts
git commit -m "feat(cli): add 'flowindex config' commands"
```

---

## Task 13: Final Wiring + Build Verification

**Files:**
- Modify: `packages/cli/src/cli.ts` (final version)
- Verify: build, help output, npm pack

- [ ] **Step 1: Verify final cli.ts has all commands**

`packages/cli/src/cli.ts` should have these imports and registrations:

```ts
import { Command } from 'commander';
import { registerBlockCommand } from './commands/block.js';
import { registerTxCommand } from './commands/tx.js';
import { registerAccountCommand } from './commands/account.js';
import { registerSearchCommand } from './commands/search.js';
import { registerConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('flowindex')
  .description('FlowIndex CLI — query Flow blockchain data from the terminal')
  .version('0.1.0');

program
  .option('--format <format>', 'output format: table, json, csv', 'table')
  .option('--quiet', 'minimal output')
  .option('--no-color', 'disable colored output');

registerBlockCommand(program);
registerTxCommand(program);
registerAccountCommand(program);
registerSearchCommand(program);
registerConfigCommand(program);

program.parse();
```

- [ ] **Step 2: Full build of both packages**

```bash
cd packages/api-client && bun run build && cd ../cli && bun run build
```

Expected: Both build without errors.

- [ ] **Step 3: Run all tests**

```bash
cd packages/api-client && bun run test && cd ../cli && bun run test
```

Expected: All tests pass.

- [ ] **Step 4: Verify CLI help output**

```bash
node packages/cli/dist/cli.js --help
```

Expected output should show:

```
Usage: flowindex [options] [command]

FlowIndex CLI — query Flow blockchain data from the terminal

Options:
  -V, --version          output the version number
  --format <format>      output format: table, json, csv (default: "table")
  --quiet                minimal output
  --no-color             disable colored output
  -h, --help             display help for command

Commands:
  block [options] [height]    Show block details. Default: latest block.
  tx [options] <hash>         Show transaction details. Auto-detects Cadence or EVM hash.
  account [options] <address> Account overview. Auto-detects Flow or EVM address.
  search [options] <query>    Search across transactions, accounts, contracts, tokens.
  config                      Manage CLI configuration
  help [command]              display help for command
```

- [ ] **Step 5: Test with live API (manual smoke test)**

```bash
# Latest block
node packages/cli/dist/cli.js block

# Specific block
node packages/cli/dist/cli.js block 85000000

# Flow transaction (use a real tx hash from the live site)
node packages/cli/dist/cli.js tx <some-flow-tx-hash> --format json

# Account
node packages/cli/dist/cli.js account e467b9dd11fa00df

# Search
node packages/cli/dist/cli.js search FlowToken
```

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A packages/api-client/ packages/cli/
git commit -m "feat(cli): finalize Phase 1 MVP — block, tx, account, search commands"
```

---

## Task 14: Update `agent-wallet` to Use Shared `api-client`

**Files:**
- Modify: `packages/agent-wallet/src/flowindex/client.ts`
- Modify: `packages/agent-wallet/package.json`

This task replaces the duplicated `FlowIndexClient` in `agent-wallet` with a re-export from the shared `api-client` package, so both consumers stay in sync.

- [ ] **Step 1: Add api-client dependency to agent-wallet**

In `packages/agent-wallet/package.json`, add to `dependencies`:

```json
"@flowindex/api-client": "workspace:*"
```

- [ ] **Step 2: Replace client.ts with re-export + extensions**

Replace `packages/agent-wallet/src/flowindex/client.ts` to import from `@flowindex/api-client` and extend with the `simulateTransaction` method (which is agent-wallet-specific):

The existing `client.ts` defines `SimulateTransactionRequest`, `SimulateTransactionResponse`, and other types inline (not in a separate `types.ts` file). The implementer must:

1. Read the current `packages/agent-wallet/src/flowindex/client.ts` fully
2. Keep `SimulateTransactionRequest`, `SimulateTransactionResponse`, and `JsonCdcValue` type definitions in the file (they are defined inline, not imported)
3. Replace general-purpose methods (`getAccount`, `getFlowBalance`, `getFtBalances`, `getNftCollections`, `getTransaction`) with imports from `@flowindex/api-client`
4. Keep `simulateTransaction` as a local method (it calls the simulator API, not the main API)

Example structure:

```ts
import { FlowIndexClient as BaseClient } from '@flowindex/api-client';

// These types are defined inline in the current client.ts — keep them here
export interface JsonCdcValue { /* ... copy from current file ... */ }
export interface SimulateTransactionRequest { /* ... copy from current file ... */ }
export interface SimulateTransactionResponse { /* ... copy from current file ... */ }

// Re-export the base client for consumers that only need query methods
export { BaseClient as FlowIndexClient };

// Extended client with simulator support (agent-wallet specific)
export class AgentWalletClient extends BaseClient {
  private readonly simulatorUrl: string;

  constructor(baseUrl: string, simulatorUrl = 'https://simulator.flowindex.io/api') {
    super({ baseUrl });
    this.simulatorUrl = simulatorUrl;
  }

  async simulateTransaction(request: SimulateTransactionRequest): Promise<SimulateTransactionResponse> {
    const resp = await fetch(`${this.simulatorUrl}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!resp.ok) {
      throw new Error(`Simulator error ${resp.status}: ${await resp.text()}`);
    }
    return resp.json() as Promise<SimulateTransactionResponse>;
  }
}
```

**Important:** Copy the exact type definitions from the current `client.ts`. Do not guess or abbreviate them.

- [ ] **Step 3: Install and run agent-wallet tests**

```bash
cd packages/agent-wallet && bun install && bun run test
```

Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add packages/agent-wallet/
git commit -m "refactor(agent-wallet): use shared @flowindex/api-client for FlowIndex queries"
```
