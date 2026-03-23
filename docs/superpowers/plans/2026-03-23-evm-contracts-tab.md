# EVM Contracts Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add EVM smart contracts browsing to `/contracts` page with Cadence/EVM tabs, plus a new EVM contract detail page at `/contracts/evm/$address`.

**Architecture:** Backend proxies Blockscout's `/api/v2/smart-contracts` endpoints. Frontend adds tab switching on the contracts list page and a new detail route. Write transactions go directly through user's wallet, not backend.

**Tech Stack:** Go (backend proxy), React 19, TanStack Start/Router, TypeScript, TailwindCSS, Prism syntax highlighting

**Spec:** `docs/superpowers/specs/2026-03-23-evm-contracts-tab-design.md`

---

## File Structure

### Backend (Go)
- **Modify:** `backend/internal/api/blockscout_proxy.go` — add `proxyBlockscoutWithBody()` for POST support
- **Modify:** `backend/internal/api/v1_handlers_evm.go` — add smart contract proxy handlers
- **Modify:** `backend/internal/api/routes_registration.go` — register new routes
- **Modify:** `backend/internal/api/routes_test.go` — add route tests

### Frontend (TypeScript/React)
- **Modify:** `frontend/app/types/blockscout.ts` — add smart contract types
- **Modify:** `frontend/app/api/evm.ts` — add smart contract API functions
- **Create:** `frontend/app/components/evm/EVMContractsList.tsx` — EVM contracts list table
- **Create:** `frontend/app/components/evm/CursorPagination.tsx` — Prev/Next pagination for Blockscout tokens
- **Modify:** `frontend/app/routes/contracts/index.tsx` — add Cadence/EVM tab switching
- **Create:** `frontend/app/routes/contracts/evm/$address.tsx` — EVM contract detail page
- **Create:** `frontend/app/components/evm/EVMContractSource.tsx` — Source code viewer tab
- **Create:** `frontend/app/components/evm/EVMContractABI.tsx` — ABI viewer tab
- **Create:** `frontend/app/components/evm/EVMContractReadWrite.tsx` — Read/Write contract interaction

---

## Task 1: Backend — POST proxy support + smart contract handlers

**Files:**
- Modify: `backend/internal/api/blockscout_proxy.go`
- Modify: `backend/internal/api/v1_handlers_evm.go`
- Modify: `backend/internal/api/routes_registration.go`
- Modify: `backend/internal/api/routes_test.go`

- [ ] **Step 1: Add `proxyBlockscoutWithBody` to blockscout_proxy.go**

Add after the existing `proxyBlockscout` function:

```go
// proxyBlockscoutWithBody forwards a request (any method) to the Blockscout API,
// including the request body and Content-Type header. Used for POST endpoints.
func (s *Server) proxyBlockscoutWithBody(w http.ResponseWriter, r *http.Request, upstreamPath string) {
	target := s.blockscoutURL + upstreamPath
	if q := r.URL.RawQuery; q != "" {
		target += "?" + q
	}
	if s.blockscoutAPIKey != "" {
		sep := "?"
		if strings.Contains(target, "?") {
			sep = "&"
		}
		target += sep + "apikey=" + s.blockscoutAPIKey
	}

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	req.Header.Set("Accept", "application/json")
	if ct := r.Header.Get("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}

	resp, err := blockscoutClient.Do(req)
	if err != nil {
		log.Printf("blockscout proxy error: %v", err)
		writeAPIError(w, http.StatusBadGateway, "upstream blockscout unavailable")
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
```

**IMPORTANT**: `blockscout_proxy.go` does NOT currently import `"strings"`. You must add it to the import block:
```go
import (
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)
```

- [ ] **Step 2: Add smart contract handlers to v1_handlers_evm.go**

Add at the end of the file:

```go
// --- EVM Smart Contracts (proxy to Blockscout) ---

func (s *Server) handleFlowListEVMSmartContracts(w http.ResponseWriter, r *http.Request) {
	s.proxyBlockscout(w, r, "/api/v2/smart-contracts")
}

func (s *Server) handleFlowGetEVMSmartContractCounters(w http.ResponseWriter, r *http.Request) {
	s.proxyBlockscout(w, r, "/api/v2/smart-contracts/counters")
}

func (s *Server) handleFlowGetEVMSmartContract(w http.ResponseWriter, r *http.Request) {
	address := normalizeAddr(mux.Vars(r)["address"])
	s.proxyBlockscout(w, r, "/api/v2/smart-contracts/0x"+address)
}

func (s *Server) handleFlowGetEVMSmartContractMethodsRead(w http.ResponseWriter, r *http.Request) {
	address := normalizeAddr(mux.Vars(r)["address"])
	s.proxyBlockscout(w, r, "/api/v2/smart-contracts/0x"+address+"/methods-read")
}

func (s *Server) handleFlowGetEVMSmartContractMethodsWrite(w http.ResponseWriter, r *http.Request) {
	address := normalizeAddr(mux.Vars(r)["address"])
	s.proxyBlockscout(w, r, "/api/v2/smart-contracts/0x"+address+"/methods-write")
}

func (s *Server) handleFlowPostEVMSmartContractQueryRead(w http.ResponseWriter, r *http.Request) {
	address := normalizeAddr(mux.Vars(r)["address"])
	s.proxyBlockscoutWithBody(w, r, "/api/v2/smart-contracts/0x"+address+"/query-read-method")
}

func (s *Server) handleFlowPostEVMSmartContractVerify(w http.ResponseWriter, r *http.Request) {
	address := normalizeAddr(mux.Vars(r)["address"])
	verifyType := mux.Vars(r)["type"]
	s.proxyBlockscoutWithBody(w, r, "/api/v2/smart-contracts/0x"+address+"/verification/via/"+verifyType)
}
```

- [ ] **Step 3: Register routes in routes_registration.go**

In `registerFlowRoutes`, add after the `/flow/evm/search` line (line 198) and BEFORE the `/flow/node` line (line 199). Note: the `/flow/evm/address/...` routes are ABOVE this insertion point (lines 191-197), not below:

```go
	// EVM Smart Contracts
	r.HandleFunc("/flow/evm/smart-contracts/counters", cachedHandler(2*time.Minute, s.handleFlowGetEVMSmartContractCounters)).Methods("GET", "OPTIONS")
	r.HandleFunc("/flow/evm/smart-contracts/{address}/methods-read", s.handleFlowGetEVMSmartContractMethodsRead).Methods("GET", "OPTIONS")
	r.HandleFunc("/flow/evm/smart-contracts/{address}/methods-write", s.handleFlowGetEVMSmartContractMethodsWrite).Methods("GET", "OPTIONS")
	r.HandleFunc("/flow/evm/smart-contracts/{address}/query-read-method", s.handleFlowPostEVMSmartContractQueryRead).Methods("POST", "OPTIONS")
	r.HandleFunc("/flow/evm/smart-contracts/{address}/verification/via/{type}", s.handleFlowPostEVMSmartContractVerify).Methods("POST", "OPTIONS")
	r.HandleFunc("/flow/evm/smart-contracts/{address}", s.handleFlowGetEVMSmartContract).Methods("GET", "OPTIONS")
	r.HandleFunc("/flow/evm/smart-contracts", s.handleFlowListEVMSmartContracts).Methods("GET", "OPTIONS")
```

**IMPORTANT**: `/counters` must be registered before `/{address}` so the router doesn't match "counters" as an address. Similarly, sub-paths like `/methods-read` must be before the bare `/{address}`.

- [ ] **Step 4: Add routes to specExcludedRoutes in routes_test.go**

The test file uses `specExcludedRoutes` for Blockscout proxy routes (not part of our OpenAPI spec). Add these entries to the `specExcludedRoutes` map in `routes_test.go`:

```go
	// EVM Smart Contract proxy routes
	"/flow/evm/smart-contracts":                                     true,
	"/flow/evm/smart-contracts/counters":                            true,
	"/flow/evm/smart-contracts/{address}":                           true,
	"/flow/evm/smart-contracts/{address}/methods-read":              true,
	"/flow/evm/smart-contracts/{address}/methods-write":             true,
	"/flow/evm/smart-contracts/{address}/query-read-method":         true,
	"/flow/evm/smart-contracts/{address}/verification/via/{type}":   true,
```

- [ ] **Step 5: Verify backend compiles**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/internal/api/blockscout_proxy.go backend/internal/api/v1_handlers_evm.go backend/internal/api/routes_registration.go backend/internal/api/routes_test.go
git commit -m "feat(backend): add EVM smart contracts proxy endpoints"
```

---

## Task 2: Frontend — Types + API client

**Files:**
- Modify: `frontend/app/types/blockscout.ts`
- Modify: `frontend/app/api/evm.ts`

- [ ] **Step 1: Add smart contract types to blockscout.ts**

Add at the end of the file:

```typescript
// --- EVM Smart Contract Types ---

export interface BSAddressParam {
  hash: string;
  name: string | null;
  is_contract: boolean;
  is_verified: boolean | null;
  implementation_name: string | null;
}

export interface BSSmartContract {
  address: BSAddressParam;
  name: string | null;
  compiler_version: string | null;
  optimization_enabled: boolean | null;
  optimization_runs: number | null;
  evm_version: string | null;
  verified_at: string | null;
  is_verified: boolean;
  source_code: string | null;
  abi: any[] | null;
  constructor_args: string | null;
  creation_bytecode: string | null;
  deployed_bytecode: string | null;
  language: string | null;
  license_type: string | null;
  tx_count: number;
  coin_balance: string | null;
  additional_sources: Array<{
    file_path: string;
    source_code: string;
  }> | null;
}

export interface BSSmartContractListItem {
  address: BSAddressParam;
  name: string | null;
  compiler_version: string | null;
  optimization_enabled: boolean | null;
  is_verified: boolean;
  language: string | null;
  license_type: string | null;
  tx_count: number;
  coin_balance: string | null;
  verified_at: string | null;
}

export interface BSSmartContractCounters {
  smart_contracts: string;
  verified_smart_contracts: string;
  new_smart_contracts_24h: string;
  verified_smart_contracts_24h: string;
  new_verified_smart_contracts_24h: string;
}

export interface BSContractMethod {
  type: string;
  method_id: string;
  name: string;
  inputs: Array<{ name: string; type: string; value?: string }>;
  outputs: Array<{ name: string; type: string; value?: string }>;
  stateMutability: string;
}
```

- [ ] **Step 2: Add smart contract API functions to evm.ts**

Add the new type imports and functions:

```typescript
// Add to imports:
import type {
  // ... existing imports ...
  BSSmartContract,
  BSSmartContractListItem,
  BSSmartContractCounters,
  BSContractMethod,
} from '@/types/blockscout';

// --- Smart Contract endpoints ---

export async function getEVMSmartContracts(
  params?: Record<string, string>, signal?: AbortSignal
): Promise<BSPaginatedResponse<BSSmartContractListItem>> {
  return evmFetch('/smart-contracts', params, signal);
}

export async function getEVMSmartContractCounters(
  signal?: AbortSignal
): Promise<BSSmartContractCounters> {
  return evmFetch('/smart-contracts/counters', undefined, signal);
}

export async function getEVMSmartContract(
  address: string, signal?: AbortSignal
): Promise<BSSmartContract> {
  return evmFetch(`/smart-contracts/${address}`, undefined, signal);
}

export async function getEVMSmartContractMethodsRead(
  address: string, signal?: AbortSignal
): Promise<BSContractMethod[]> {
  return evmFetch(`/smart-contracts/${address}/methods-read`, undefined, signal);
}

export async function getEVMSmartContractMethodsWrite(
  address: string, signal?: AbortSignal
): Promise<BSContractMethod[]> {
  return evmFetch(`/smart-contracts/${address}/methods-write`, undefined, signal);
}

export async function queryEVMSmartContractReadMethod(
  address: string, data: { method_id: string; args: string[] }, signal?: AbortSignal
): Promise<any> {
  const baseUrl = await resolveApiBaseUrl();
  const res = await fetch(`${baseUrl}/flow/evm/smart-contracts/${address}/query-read-method`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal,
  });
  if (!res.ok) throw new Error(`Query failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no errors in the modified files

- [ ] **Step 4: Commit**

```bash
git add frontend/app/types/blockscout.ts frontend/app/api/evm.ts
git commit -m "feat(frontend): add EVM smart contract types and API client"
```

---

## Task 3: Frontend — CursorPagination component

**Files:**
- Create: `frontend/app/components/evm/CursorPagination.tsx`

- [ ] **Step 1: Create CursorPagination component**

This component provides Prev/Next navigation using Blockscout's opaque `next_page_params` tokens. It maintains a stack of previous page params for back-navigation.

```typescript
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BSPageParams } from '@/types/blockscout';

interface CursorPaginationProps {
  nextPageParams: BSPageParams | null;
  hasPrev: boolean;
  isLoading?: boolean;
  onNext: () => void;
  onPrev: () => void;
}

export function CursorPagination({ nextPageParams, hasPrev, isLoading, onNext, onPrev }: CursorPaginationProps) {
  const hasNext = nextPageParams !== null;
  if (!hasNext && !hasPrev) return null;

  return (
    <div className="flex items-center justify-center space-x-4 mt-8">
      <button
        onClick={onPrev}
        disabled={!hasPrev || isLoading}
        className="flex items-center px-4 py-2 border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200 text-zinc-900 dark:text-white"
      >
        <ChevronLeft className="w-4 h-4 mr-2" />
        <span className="text-xs uppercase tracking-widest font-mono">Prev</span>
      </button>

      <div className="flex items-center space-x-1">
        <span className="w-1 h-1 bg-zinc-300 dark:bg-white rounded-full opacity-30" />
        <span className="w-1 h-1 bg-nothing-green rounded-full" />
        <span className="w-1 h-1 bg-zinc-300 dark:bg-white rounded-full opacity-30" />
      </div>

      <button
        onClick={onNext}
        disabled={!hasNext || isLoading}
        className="flex items-center px-4 py-2 border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200 text-zinc-900 dark:text-white"
      >
        <span className="text-xs uppercase tracking-widest font-mono">Next</span>
        <ChevronRight className="w-4 h-4 ml-2" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/components/evm/CursorPagination.tsx
git commit -m "feat(frontend): add CursorPagination component for Blockscout pagination"
```

---

## Task 4: Frontend — EVMContractsList component

**Files:**
- Create: `frontend/app/components/evm/EVMContractsList.tsx`

- [ ] **Step 1: Create EVMContractsList component**

This is the main table component for the EVM tab. It fetches from `/flow/evm/smart-contracts`, displays the contract list with sortable columns, search, and cursor-based pagination.

```typescript
import { useState, useEffect, useCallback } from 'react';
import { Link } from '@tanstack/react-router';
import { Search, CheckCircle, XCircle, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { getEVMSmartContracts, getEVMSmartContractCounters } from '@/api/evm';
import { formatWei, truncateHash } from '@/lib/evmUtils';
import { formatRelativeTime } from '@/lib/time';
import { useTimeTicker } from '@/hooks/useTimeTicker';
import { CursorPagination } from './CursorPagination';
import type { BSSmartContractListItem, BSSmartContractCounters, BSPageParams } from '@/types/blockscout';

interface EVMContractsListProps {
  initialQuery?: string;
}

export function EVMContractsList({ initialQuery = '' }: EVMContractsListProps) {
  const [contracts, setContracts] = useState<BSSmartContractListItem[]>([]);
  const [counters, setCounters] = useState<BSSmartContractCounters | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState('');
  const [nextPageParams, setNextPageParams] = useState<BSPageParams | null>(null);
  const [pageStack, setPageStack] = useState<(BSPageParams | null)[]>([]);
  const [currentPageParams, setCurrentPageParams] = useState<BSPageParams | null>(null);
  const nowTick = useTimeTicker(20000);

  const fetchContracts = useCallback(async (pageParams?: BSPageParams | null) => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (query) params.q = query;
      if (sortBy) params.sort = sortBy;
      if (pageParams) {
        Object.entries(pageParams).forEach(([k, v]) => { params[k] = String(v); });
      }
      const res = await getEVMSmartContracts(params);
      setContracts(res.items || []);
      setNextPageParams(res.next_page_params);
    } catch (e) {
      console.error('Failed to load EVM contracts', e);
      setError('Failed to load EVM contracts. Please retry.');
    } finally {
      setLoading(false);
    }
  }, [query, sortBy]);

  // Initial load + counters
  useEffect(() => {
    fetchContracts();
    getEVMSmartContractCounters().then(setCounters).catch(() => {});
  }, [fetchContracts]);

  const handleNext = () => {
    if (!nextPageParams) return;
    setPageStack(prev => [...prev, currentPageParams]);
    setCurrentPageParams(nextPageParams);
    fetchContracts(nextPageParams);
  };

  const handlePrev = () => {
    if (pageStack.length === 0) return;
    const prev = [...pageStack];
    const prevParams = prev.pop()!;
    setPageStack(prev);
    setCurrentPageParams(prevParams);
    fetchContracts(prevParams);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(searchInput.trim());
    setPageStack([]);
    setCurrentPageParams(null);
  };

  const handleSort = (col: string) => {
    setSortBy(prev => prev === col ? `-${col}` : col);
    setPageStack([]);
    setCurrentPageParams(null);
  };

  const totalContracts = counters ? parseInt(counters.smart_contracts, 10) : 0;
  const verifiedContracts = counters ? parseInt(counters.verified_smart_contracts, 10) : 0;

  return (
    <div className="space-y-6">
      {/* Search */}
      <motion.form
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onSubmit={handleSearch}
        className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 p-4 rounded-sm shadow-sm dark:shadow-none flex items-center gap-3"
      >
        <div className="flex items-center gap-2 text-zinc-500">
          <Search className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-widest font-semibold">Filter</span>
        </div>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search by contract name or address"
          className="flex-1 bg-transparent border border-zinc-200 dark:border-white/10 px-3 py-2 rounded-sm text-sm font-mono text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-nothing-green/30"
        />
        <button
          type="submit"
          className="px-4 py-2 border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-black/30 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-sm text-xs uppercase tracking-widest font-semibold text-zinc-700 dark:text-zinc-200 transition-colors"
        >
          Apply
        </button>
      </motion.form>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 gap-6"
      >
        <div className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 p-6 rounded-sm shadow-sm dark:shadow-none">
          <p className="text-xs text-zinc-500 dark:text-gray-400 uppercase tracking-widest mb-1">Total Contracts</p>
          <p className="text-3xl font-bold font-mono text-zinc-900 dark:text-white">
            <NumberFlow value={totalContracts} format={{ useGrouping: true }} />
          </p>
        </div>
        <div className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 p-6 rounded-sm shadow-sm dark:shadow-none">
          <p className="text-xs text-zinc-500 dark:text-gray-400 uppercase tracking-widest mb-1">Verified Contracts</p>
          <p className="text-3xl font-bold font-mono text-zinc-900 dark:text-white">
            <NumberFlow value={verifiedContracts} format={{ useGrouping: true }} />
          </p>
        </div>
      </motion.div>

      {/* Table */}
      <div className="bg-white dark:bg-nothing-dark border border-zinc-200 dark:border-white/10 rounded-sm overflow-hidden shadow-sm dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-white/5 bg-zinc-50/50 dark:bg-white/5">
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider">Contract</th>
                <th
                  className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-right cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                  onClick={() => handleSort('balance')}
                >
                  Balance {sortBy === 'balance' ? '↑' : sortBy === '-balance' ? '↓' : ''}
                </th>
                <th
                  className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-right cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200"
                  onClick={() => handleSort('txs')}
                >
                  Txs {sortBy === 'txs' ? '↑' : sortBy === '-txs' ? '↓' : ''}
                </th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider">Language / Compiler</th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-center">Settings</th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider text-center">Verified</th>
                <th className="p-4 text-xs font-semibold text-zinc-500 dark:text-gray-400 uppercase tracking-wider">License</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-zinc-500 text-sm">Loading EVM contracts...</td></tr>
              ) : error ? (
                <tr><td colSpan={7} className="p-8 text-center text-amber-600 dark:text-amber-400 text-sm">{error}</td></tr>
              ) : contracts.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-zinc-500 text-sm">No contracts found</td></tr>
              ) : (
                <AnimatePresence mode="popLayout">
                  {contracts.map((c) => {
                    const addr = c.address?.hash || '';
                    const shortAddr = truncateHash(addr, 8, 6);
                    const balance = c.coin_balance ? formatWei(c.coin_balance) : '0';
                    const compiler = c.compiler_version ? c.compiler_version.replace(/^v/, '') : '';
                    const lang = c.language || '';

                    return (
                      <motion.tr
                        layout
                        key={addr}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="border-b border-zinc-100 dark:border-white/5 group hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                      >
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            <Link
                              to="/contracts/evm/$address"
                              params={{ address: addr }}
                              className="font-mono text-sm text-zinc-900 dark:text-white hover:underline font-medium"
                            >
                              {c.name || 'Unnamed'}
                            </Link>
                            <span className="font-mono text-xs text-zinc-500">{shortAddr}</span>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <span className="font-mono text-sm text-zinc-900 dark:text-white">{balance}</span>
                        </td>
                        <td className="p-4 text-right">
                          <span className="font-mono text-sm text-zinc-900 dark:text-white">{(c.tx_count || 0).toLocaleString()}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            {lang && <span className="text-sm text-zinc-900 dark:text-white">{lang}</span>}
                            {compiler && <span className="text-xs text-zinc-500 font-mono">{compiler}</span>}
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          {c.optimization_enabled ? (
                            <span className="text-xs text-emerald-500" title="Optimization enabled">Opt</span>
                          ) : (
                            <span className="text-xs text-zinc-400">{'\u2014'}</span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {c.is_verified ? (
                            <CheckCircle className="w-4 h-4 text-emerald-500 inline-block" />
                          ) : (
                            <XCircle className="w-4 h-4 text-zinc-400 inline-block" />
                          )}
                        </td>
                        <td className="p-4">
                          <span className="text-xs text-zinc-500">{c.license_type || '\u2014'}</span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-zinc-200 dark:border-white/5">
          <CursorPagination
            nextPageParams={nextPageParams}
            hasPrev={pageStack.length > 0}
            isLoading={loading}
            onNext={handleNext}
            onPrev={handlePrev}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/evm/EVMContractsList.tsx
git commit -m "feat(frontend): add EVMContractsList component"
```

---

## Task 5: Frontend — Tab switching on contracts page

**Files:**
- Modify: `frontend/app/routes/contracts/index.tsx`

- [ ] **Step 1: Add tab switching**

Modify the contracts index page to add Cadence/EVM tabs. Key changes:

1. Add `tab` to search params validation
2. Add tab UI above the filter row
3. Conditionally render existing Cadence content or new `EVMContractsList`

Update the search params interface and validation:

```typescript
interface ContractsSearch {
    page?: number;
    query?: string;
    kind?: string;
    tab?: string; // 'cadence' | 'evm'
}
```

Update `validateSearch`:
```typescript
validateSearch: (search: Record<string, unknown>): ContractsSearch => {
    return {
        page: Number(search.page) || 1,
        query: (search.query as string) || '',
        kind: (search.kind as string) || '',
        tab: (search.tab as string) || 'cadence',
    }
},
```

Add import at top:
```typescript
import { EVMContractsList } from '../../components/evm/EVMContractsList';
```

In the `Contracts` component, read tab from search:
```typescript
const { page: searchPage, query: searchQuery_, kind: searchKind, tab: searchTab } = Route.useSearch();
const activeTab = searchTab || 'cadence';
```

Add tab buttons after the header `motion.div` and before the filter form. Then wrap existing Cadence UI in a conditional `{activeTab === 'cadence' && (...)}` and add `{activeTab === 'evm' && <EVMContractsList />}`.

Tab UI (insert after the header section, before the filter form):

```tsx
{/* Network Tabs */}
<motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.03 }}
    className="flex items-center gap-2"
>
    {[
        { label: 'Cadence', value: 'cadence' },
        { label: 'EVM', value: 'evm' },
    ].map((t) => (
        <button
            key={t.value}
            onClick={() => navigate({ search: { tab: t.value, page: 1, query: '', kind: '' } })}
            className={`px-5 py-2 text-sm font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                activeTab === t.value
                    ? 'border-nothing-green text-nothing-green-dark dark:text-nothing-green'
                    : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
        >
            {t.label}
        </button>
    ))}
</motion.div>
```

- [ ] **Step 2: Verify the page builds**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Lint**

Run: `cd frontend && bun run lint 2>&1 | tail -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/app/routes/contracts/index.tsx
git commit -m "feat(frontend): add Cadence/EVM tab switching on contracts page"
```

---

## Task 6: Frontend — EVM Contract Detail Page (core)

**Files:**
- Create: `frontend/app/routes/contracts/evm/$address.tsx`

- [ ] **Step 1: Create the route file**

This is the main detail page. It loads contract metadata from the Blockscout API proxy, displays header info and tabbed content.

The page should:
- Fetch contract data via `getEVMSmartContract(address)` in loader
- Show header with: contract name, address (with copy), verification badge, balance
- Tab navigation: Source, ABI, Bytecode, Read, Write, Transactions, Transfers, Internal Txs
- Tab state in URL: `?tab=source|abi|bytecode|read|write|txs|transfers|internal`
- For unverified contracts: default to `bytecode` tab, disable Source/ABI/Read/Write

Key structure:

```typescript
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useEffect, lazy, Suspense } from 'react'
import { ArrowLeft, Code, FileJson, Binary, BookOpen, PenTool, List, ArrowLeftRight, Layers, ShieldCheck, ShieldOff, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'
import { getEVMSmartContract } from '@/api/evm'
import { formatWei, truncateHash } from '@/lib/evmUtils'
import { CopyButton } from '@/components/animate-ui/components/buttons/copy'
import { EVMTransactionList } from '@/components/evm/EVMTransactionList'
import { EVMTokenTransfers } from '@/components/evm/EVMTokenTransfers'
import { EVMInternalTxList } from '@/components/evm/EVMInternalTxList'
import type { BSSmartContract } from '@/types/blockscout'

// Lazy imports — these components are created in Tasks 7-8.
// Using lazy() avoids build errors if the files don't exist yet.
const EVMContractSource = lazy(() => import('@/components/evm/EVMContractSource').then(m => ({ default: m.EVMContractSource })));
const EVMContractABI = lazy(() => import('@/components/evm/EVMContractABI').then(m => ({ default: m.EVMContractABI })));
const EVMContractReadWrite = lazy(() => import('@/components/evm/EVMContractReadWrite').then(m => ({ default: m.EVMContractReadWrite })));
```

Tab definition:

```typescript
type DetailTab = 'source' | 'abi' | 'bytecode' | 'read' | 'write' | 'txs' | 'transfers' | 'internal';

const TABS: Array<{ value: DetailTab; label: string; icon: any; verifiedOnly?: boolean }> = [
  { value: 'source', label: 'Source', icon: Code, verifiedOnly: true },
  { value: 'abi', label: 'ABI', icon: FileJson, verifiedOnly: true },
  { value: 'bytecode', label: 'Bytecode', icon: Binary },
  { value: 'read', label: 'Read', icon: BookOpen, verifiedOnly: true },
  { value: 'write', label: 'Write', icon: PenTool, verifiedOnly: true },
  { value: 'txs', label: 'Transactions', icon: List },
  { value: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { value: 'internal', label: 'Internal Txs', icon: Layers },
];
```

The route validates `?tab=` search param and fetches contract data in the loader. Tab content renders conditionally.

**Unverified contract behavior:**
- Default tab is `bytecode` (always available)
- Source, ABI, Read, Write tabs rendered as disabled with tooltip "Contract not verified"
- Show "Verify & Publish" CTA button in header for unverified contracts

**Bytecode tab** is rendered inline (no separate component needed):
```tsx
{activeTab === 'bytecode' && (
  <div className="space-y-4">
    {contract.creation_bytecode && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider">Creation Bytecode</h3>
          <CopyButton text={contract.creation_bytecode} />
        </div>
        <pre className="bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-sm p-4 text-xs font-mono break-all max-h-[400px] overflow-y-auto">
          {contract.creation_bytecode}
        </pre>
      </div>
    )}
    {contract.deployed_bytecode && (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider">Deployed Bytecode</h3>
          <CopyButton text={contract.deployed_bytecode} />
        </div>
        <pre className="bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-sm p-4 text-xs font-mono break-all max-h-[400px] overflow-y-auto">
          {contract.deployed_bytecode}
        </pre>
      </div>
    )}
  </div>
)}
```

Wrap lazy-loaded tab components in `<Suspense>` with a loading fallback.

- [ ] **Step 2: Verify compilation**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/routes/contracts/evm/\$address.tsx
git commit -m "feat(frontend): add EVM contract detail page route"
```

---

## Task 7: Frontend — Source + ABI + Bytecode tab components

**Files:**
- Create: `frontend/app/components/evm/EVMContractSource.tsx`
- Create: `frontend/app/components/evm/EVMContractABI.tsx`

- [ ] **Step 1: Create EVMContractSource component**

Displays verified Solidity source code with syntax highlighting. Supports multi-file contracts with a file explorer sidebar.

```typescript
import { useState } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import solidity from 'react-syntax-highlighter/dist/esm/languages/prism/solidity';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/contexts/ThemeContext';
import { CopyButton } from '@/components/animate-ui/components/buttons/copy';
import { FileText, Settings, Info } from 'lucide-react';
import type { BSSmartContract } from '@/types/blockscout';

SyntaxHighlighter.registerLanguage('solidity', solidity);

interface EVMContractSourceProps {
  contract: BSSmartContract;
}
```

Features:
- File tabs when `additional_sources` is present
- Compiler info bar: version, optimization, runs, EVM version
- Constructor arguments display (decoded hex)
- Syntax highlighted source code with line numbers
- Copy button for source code

- [ ] **Step 2: Create EVMContractABI component**

Simple JSON viewer with copy button:

```typescript
import { useState } from 'react';
import { CopyButton } from '@/components/animate-ui/components/buttons/copy';
import type { BSSmartContract } from '@/types/blockscout';

interface EVMContractABIProps {
  contract: BSSmartContract;
}

export function EVMContractABI({ contract }: EVMContractABIProps) {
  const abiStr = contract.abi ? JSON.stringify(contract.abi, null, 2) : '';

  if (!abiStr) {
    return <div className="p-8 text-center text-zinc-500">No ABI available</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider">Contract ABI</h3>
        <CopyButton text={abiStr} />
      </div>
      <pre className="bg-zinc-50 dark:bg-black/30 border border-zinc-200 dark:border-white/10 rounded-sm p-4 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto max-h-[600px] overflow-y-auto">
        {abiStr}
      </pre>
    </div>
  );
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/evm/EVMContractSource.tsx frontend/app/components/evm/EVMContractABI.tsx
git commit -m "feat(frontend): add EVMContractSource and EVMContractABI components"
```

---

## Task 8: Frontend — Read/Write Contract interaction component

**Files:**
- Create: `frontend/app/components/evm/EVMContractReadWrite.tsx`

- [ ] **Step 1: Create EVMContractReadWrite component**

This component handles both Read and Write interactions. Read calls go through the backend proxy. Write calls encode calldata client-side and submit via the user's wallet.

```typescript
import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Play, Loader2 } from 'lucide-react';
import { getEVMSmartContractMethodsRead, getEVMSmartContractMethodsWrite, queryEVMSmartContractReadMethod } from '@/api/evm';
import type { BSContractMethod } from '@/types/blockscout';

interface EVMContractReadWriteProps {
  address: string;
  mode: 'read' | 'write';
}
```

Features:
- Fetch methods on mount from `methods-read` or `methods-write` endpoint
- Each method is an expandable accordion
- Input fields for each parameter (typed)
- Read mode: "Query" button → calls `query-read-method` POST → displays result inline
- Write mode: "Write" button → encodes calldata from ABI → sends via `window.ethereum` or connected wallet
- Loading/error states per method

- [ ] **Step 2: Verify compilation**

Run: `cd frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/evm/EVMContractReadWrite.tsx
git commit -m "feat(frontend): add EVMContractReadWrite interaction component"
```

---

## Task 9: Integration test + lint + build

**Files:** None new — validation only

- [ ] **Step 1: Run frontend lint**

Run: `cd frontend && bun run lint`
Expected: no errors

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && NODE_OPTIONS="--max-old-space-size=8192" bun run build 2>&1 | tail -30`
Expected: successful build

- [ ] **Step 3: Run backend build**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 4: Run backend tests**

Run: `cd backend && go test ./internal/api/ -v -run TestRoutes 2>&1 | tail -20`
Expected: all pass

- [ ] **Step 5: Fix any issues and commit**

If any lint/build/test failures, fix and commit fixes.

---

## Task 10: Manual smoke test + final commit

- [ ] **Step 1: Start dev environment**

Run: `cd frontend && bun run dev`

- [ ] **Step 2: Test contracts page tab switching**

Navigate to `http://localhost:5173/contracts` — should show Cadence tab by default.
Click "EVM" tab — URL should change to `?tab=evm`, should fetch and display EVM contracts list.
Click "Cadence" tab — should switch back.

- [ ] **Step 3: Test EVM contract detail page**

Click any contract row in EVM list — should navigate to `/contracts/evm/0x...`.
Verify tabs work: Source (for verified), Bytecode (always), Transactions.
Verify unverified contracts show Bytecode as default, Source/ABI/Read/Write disabled.

- [ ] **Step 4: Test Read Contract**

On a verified contract, go to Read tab. Expand a method, fill params, click Query. Verify result displays.

- [ ] **Step 5: Final commit if any fixes**

```bash
git add -A
git commit -m "fix(frontend): smoke test fixes for EVM contracts tab"
```
