# Search Preview & Contract Search Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an as-you-type search dropdown to the header search bar with contract/token/NFT fuzzy search and 64-hex ambiguity resolution.

**Architecture:** New backend `GET /flow/search` endpoint queries contracts, FT tokens, and NFT collections in parallel goroutines. New frontend `SearchDropdown` component renders grouped results below the search input. Existing deterministic pattern-match navigation (blocks, addresses, etc.) is preserved — dropdown only appears for free-text and ambiguous 64-hex inputs.

**Tech Stack:** Go (backend handler + repository), React 19 + TypeScript (frontend component + hook), TailwindCSS, TanStack Router

**Spec:** `docs/superpowers/specs/2026-03-13-search-preview-design.md`

---

## File Structure

### Backend
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `backend/internal/api/v1_handlers_search.go` | `handleSearch()` handler — validates `q` param, calls `SearchAll()`, returns grouped JSON |
| Create | `backend/internal/repository/search.go` | `SearchAll()` method — 3 parallel queries, returns `SearchAllResult` |
| Modify | `backend/internal/api/routes_registration.go` | Register `GET /flow/search` with `cachedHandler(30s)` |

### Frontend
| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/app/hooks/useSearch.ts` | Debounced search hook — pattern detection, API calls, state management |
| Create | `frontend/app/components/SearchDropdown.tsx` | Dropdown UI — grouped results, keyboard nav, click handling |
| Modify | `frontend/app/components/Header.tsx` | Integrate dropdown, adjust Enter behavior for 64-hex case |
| Modify | `frontend/app/api.ts` | Add `searchAll()` function |

---

## Chunk 1: Backend Search Endpoint

### Task 1: Repository — `SearchAll()` method

**Files:**
- Create: `backend/internal/repository/search.go`

- [ ] **Step 1: Create the SearchAll result types and method**

Create `backend/internal/repository/search.go`:

```go
package repository

import (
	"context"
	"fmt"
	"sync"
)

// SearchResult types for the unified search endpoint.

type SearchContractResult struct {
	Address        string `json:"address"`
	Name           string `json:"name"`
	Kind           string `json:"kind"`
	DependentCount int    `json:"dependent_count"`
}

type SearchTokenResult struct {
	Symbol        string `json:"symbol"`
	Name          string `json:"name"`
	Address       string `json:"address"`
	ContractName  string `json:"contract_name"`
	MarketSymbol  string `json:"market_symbol,omitempty"`
}

type SearchNFTCollectionResult struct {
	Name         string `json:"name"`
	Address      string `json:"address"`
	ContractName string `json:"contract_name"`
	ItemCount    int64  `json:"item_count"`
}

type SearchAllResult struct {
	Contracts      []SearchContractResult      `json:"contracts"`
	Tokens         []SearchTokenResult         `json:"tokens"`
	NFTCollections []SearchNFTCollectionResult  `json:"nft_collections"`
}

func (r *Repository) SearchAll(ctx context.Context, query string, limit int) (SearchAllResult, error) {
	if limit <= 0 || limit > 5 {
		limit = 3
	}
	pattern := "%" + query + "%"

	var result SearchAllResult
	var wg sync.WaitGroup
	var errContracts, errTokens, errNFTs error

	wg.Add(3)

	// Contracts
	go func() {
		defer wg.Done()
		rows, err := r.db.Query(ctx, `
			SELECT encode(sc.address, 'hex'), sc.name, COALESCE(sc.kind, ''), COALESCE(sc.dependent_count, 0)
			FROM app.smart_contracts sc
			WHERE sc.name ILIKE $1
			ORDER BY sc.dependent_count DESC NULLS LAST, sc.address ASC
			LIMIT $2`, pattern, limit)
		if err != nil {
			errContracts = fmt.Errorf("contracts: %w", err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var c SearchContractResult
			if err := rows.Scan(&c.Address, &c.Name, &c.Kind, &c.DependentCount); err != nil {
				errContracts = fmt.Errorf("contracts scan: %w", err)
				return
			}
			result.Contracts = append(result.Contracts, c)
		}
		errContracts = rows.Err()
	}()

	// FT Tokens
	go func() {
		defer wg.Done()
		rows, err := r.db.Query(ctx, `
			SELECT COALESCE(ft.symbol, ''), COALESCE(ft.name, ''), encode(ft.contract_address, 'hex'),
			       COALESCE(ft.contract_name, ''), COALESCE(ft.market_symbol, '')
			FROM app.ft_tokens ft
			WHERE COALESCE(ft.name, '') ILIKE $1
			   OR COALESCE(ft.symbol, '') ILIKE $1
			ORDER BY ft.contract_address ASC
			LIMIT $2`, pattern, limit)
		if err != nil {
			errTokens = fmt.Errorf("tokens: %w", err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var t SearchTokenResult
			if err := rows.Scan(&t.Symbol, &t.Name, &t.Address, &t.ContractName, &t.MarketSymbol); err != nil {
				errTokens = fmt.Errorf("tokens scan: %w", err)
				return
			}
			result.Tokens = append(result.Tokens, t)
		}
		errTokens = rows.Err()
	}()

	// NFT Collections
	go func() {
		defer wg.Done()
		rows, err := r.db.Query(ctx, `
			SELECT COALESCE(c.name, c.contract_name, ''),
			       encode(c.contract_address, 'hex'),
			       COALESCE(c.contract_name, ''),
			       COALESCE(s.nft_count, 0)
			FROM app.nft_collections c
			LEFT JOIN app.nft_collection_stats s
			  ON s.contract_address = c.contract_address AND s.contract_name = c.contract_name
			WHERE COALESCE(c.name, '') ILIKE $1
			   OR COALESCE(c.contract_name, '') ILIKE $1
			ORDER BY COALESCE(s.nft_count, 0) DESC, c.contract_address ASC
			LIMIT $2`, pattern, limit)
		if err != nil {
			errNFTs = fmt.Errorf("nft_collections: %w", err)
			return
		}
		defer rows.Close()
		for rows.Next() {
			var n SearchNFTCollectionResult
			if err := rows.Scan(&n.Name, &n.Address, &n.ContractName, &n.ItemCount); err != nil {
				errNFTs = fmt.Errorf("nft_collections scan: %w", err)
				return
			}
			result.NFTCollections = append(result.NFTCollections, n)
		}
		errNFTs = rows.Err()
	}()

	wg.Wait()

	// Return first error encountered
	for _, e := range []error{errContracts, errTokens, errNFTs} {
		if e != nil {
			return result, e
		}
	}

	// Ensure non-nil slices for JSON
	if result.Contracts == nil {
		result.Contracts = []SearchContractResult{}
	}
	if result.Tokens == nil {
		result.Tokens = []SearchTokenResult{}
	}
	if result.NFTCollections == nil {
		result.NFTCollectionResult = []SearchNFTCollectionResult{}
	}

	return result, nil
}
```

Note: Fix the typo in the nil-check — use `result.NFTCollections` not `result.NFTCollectionResult`.

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket/backend && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/repository/search.go
git commit -m "feat(search): add SearchAll repository method for unified search"
```

---

### Task 2: API Handler — `handleSearch()`

**Files:**
- Create: `backend/internal/api/v1_handlers_search.go`
- Modify: `backend/internal/api/routes_registration.go`

- [ ] **Step 1: Create the handler**

Create `backend/internal/api/v1_handlers_search.go`:

```go
package api

import (
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if s.repo == nil {
		writeAPIError(w, http.StatusInternalServerError, "repository unavailable")
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		writeAPIError(w, http.StatusBadRequest, "query must be at least 2 characters")
		return
	}
	if len(q) > 100 {
		writeAPIError(w, http.StatusBadRequest, "query must be at most 100 characters")
		return
	}

	limit := 3
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 5 {
			limit = n
		}
	}

	result, err := s.repo.SearchAll(r.Context(), q, limit)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeAPIResponse(w, result, nil, nil)
}
```

- [ ] **Step 2: Register the route**

In `backend/internal/api/routes_registration.go`, add to `registerFlowRoutes()`:

```go
r.HandleFunc("/flow/search", cachedHandler(30*time.Second, s.handleSearch)).Methods("GET", "OPTIONS")
```

Add it near the other `/flow/` routes (e.g., near `/flow/events/search`).

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket/backend && go build ./...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/internal/api/v1_handlers_search.go backend/internal/api/routes_registration.go
git commit -m "feat(search): add unified GET /flow/search endpoint"
```

---

## Chunk 2: Frontend Search Hook & API

### Task 3: API client — `searchAll()` function

**Files:**
- Modify: `frontend/app/api.ts`

- [ ] **Step 1: Add search types and function**

Add to the bottom of `frontend/app/api.ts`:

```typescript
// Unified search types
export interface SearchContractResult {
  address: string;
  name: string;
  kind: string;
  dependent_count: number;
}

export interface SearchTokenResult {
  symbol: string;
  name: string;
  address: string;
  contract_name: string;
  market_symbol?: string;
}

export interface SearchNFTCollectionResult {
  name: string;
  address: string;
  contract_name: string;
  item_count: number;
}

export interface SearchAllResponse {
  contracts: SearchContractResult[];
  tokens: SearchTokenResult[];
  nft_collections: SearchNFTCollectionResult[];
}

export async function searchAll(query: string, limit = 3): Promise<SearchAllResponse> {
  const baseUrl = await resolveApiBaseUrl();
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const res = await fetch(`${baseUrl}/flow/v1/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? { contracts: [], tokens: [], nft_collections: [] };
}
```

Note: Uses `fetch` with `/flow/v1/search` path (the `/v1/` gets stripped by nginx in production, matching the backend route `/flow/search`). This is consistent with how `handleSearch` in `Header.tsx` already calls `/flow/v1/transaction/`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket/frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api.ts
git commit -m "feat(search): add searchAll API client function"
```

---

### Task 4: Search hook — `useSearch()`

**Files:**
- Create: `frontend/app/hooks/useSearch.ts`

- [ ] **Step 1: Create the search hook**

Create `frontend/app/hooks/useSearch.ts`:

```typescript
import { useState, useRef, useCallback, useEffect } from 'react';
import { searchAll, type SearchAllResponse } from '../api';

export type SearchMode = 'idle' | 'quick-match' | 'fuzzy';

export interface QuickMatchItem {
  type: 'block' | 'cadence-tx' | 'evm-tx' | 'flow-account' | 'coa' | 'public-key';
  label: string;
  value: string; // the raw input or resolved value
  route: string; // where to navigate
}

export interface SearchState {
  mode: SearchMode;
  quickMatches: QuickMatchItem[];
  fuzzyResults: SearchAllResponse | null;
  isLoading: boolean;
  error: boolean;
}

const DEBOUNCE_MS = 300;

// Pattern matchers — order matters (more specific first)
const PATTERNS: Array<{ regex: RegExp; getMatches: (input: string) => QuickMatchItem[] }> = [
  {
    // Public key: 128 hex chars
    regex: /^(0x)?[a-fA-F0-9]{128}$/,
    getMatches: (input) => {
      const key = input.replace(/^0x/i, '');
      return [{ type: 'public-key', label: `Public Key ${key.slice(0, 8)}...${key.slice(-8)}`, value: key, route: `/key/${key}` }];
    },
  },
  {
    // EVM tx hash: 0x + 64 hex
    regex: /^0x[a-fA-F0-9]{64}$/,
    getMatches: (input) => [
      { type: 'evm-tx', label: `EVM Transaction ${input.slice(0, 10)}...${input.slice(-8)}`, value: input, route: `/txs/evm/${input}` },
    ],
  },
  {
    // Ambiguous 64 hex: could be Cadence or EVM tx
    regex: /^[a-fA-F0-9]{64}$/,
    getMatches: (input) => [
      { type: 'cadence-tx', label: `Cadence Transaction ${input.slice(0, 8)}...${input.slice(-8)}`, value: input, route: `/txs/${input}` },
      { type: 'evm-tx', label: `EVM Transaction 0x${input.slice(0, 6)}...${input.slice(-8)}`, value: `0x${input}`, route: `/txs/evm/0x${input}` },
    ],
  },
  {
    // Block height: pure digits
    regex: /^\d+$/,
    getMatches: (input) => [{ type: 'block', label: `Block #${input}`, value: input, route: `/blocks/${input}` }],
  },
  {
    // COA / EVM address: 40 hex
    regex: /^(0x)?[a-fA-F0-9]{40}$/,
    getMatches: (input) => {
      const addr = input.startsWith('0x') ? input : `0x${input}`;
      return [{ type: 'coa', label: `EVM Address ${addr.slice(0, 6)}...${addr.slice(-4)}`, value: addr, route: '' }]; // route resolved async
    },
  },
  {
    // Flow address: 16 hex
    regex: /^(0x)?[a-fA-F0-9]{16}$/,
    getMatches: (input) => {
      const addr = input.startsWith('0x') ? input : `0x${input}`;
      return [{ type: 'flow-account', label: `Flow Account ${addr}`, value: addr, route: `/accounts/${addr}` }];
    },
  },
];

export function useSearch() {
  const [state, setState] = useState<SearchState>({
    mode: 'idle',
    quickMatches: [],
    fuzzyResults: null,
    isLoading: false,
    error: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const abortRef = useRef<AbortController>(null);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setState({ mode: 'idle', quickMatches: [], fuzzyResults: null, isLoading: false, error: false });
  }, []);

  const search = useCallback((query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      reset();
      return;
    }

    // Check deterministic patterns
    for (const { regex, getMatches } of PATTERNS) {
      if (regex.test(trimmed)) {
        // Only show dropdown for ambiguous 64-hex case
        const matches = getMatches(trimmed);
        if (matches.length > 1) {
          setState({ mode: 'quick-match', quickMatches: matches, fuzzyResults: null, isLoading: false, error: false });
        } else {
          // Single deterministic match — don't show dropdown, let Enter direct-jump
          reset();
        }
        return;
      }
    }

    // Fuzzy text search with debounce
    setState((prev) => ({ ...prev, mode: 'fuzzy', isLoading: true, error: false }));
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await searchAll(trimmed);
        if (!controller.signal.aborted) {
          setState({ mode: 'fuzzy', quickMatches: [], fuzzyResults: data, isLoading: false, error: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, isLoading: false, error: true }));
        }
      }
    }, DEBOUNCE_MS);
  }, [reset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return { ...state, search, reset };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket/frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/hooks/useSearch.ts
git commit -m "feat(search): add useSearch hook with pattern detection and debounced API"
```

---

## Chunk 3: Frontend Dropdown Component

### Task 5: SearchDropdown component

**Files:**
- Create: `frontend/app/components/SearchDropdown.tsx`

- [ ] **Step 1: Create the dropdown component**

Create `frontend/app/components/SearchDropdown.tsx`:

```tsx
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileCode, Coins, ImageIcon, ArrowRight } from 'lucide-react';
import type { SearchState, QuickMatchItem } from '../hooks/useSearch';
import type { SearchAllResponse } from '../api';

interface SearchDropdownProps {
  state: SearchState;
  onClose: () => void;
  highlightQuery: string;
}

export interface SearchDropdownHandle {
  activeIndex: number;
  moveUp: () => void;
  moveDown: () => void;
  selectActive: () => void;
  totalItems: () => number;
}

// Flatten all results into a single navigable list
function getFlatItems(state: SearchState): Array<{ type: string; label: string; route: string }> {
  const items: Array<{ type: string; label: string; route: string }> = [];

  if (state.mode === 'quick-match') {
    for (const m of state.quickMatches) {
      items.push({ type: m.type, label: m.label, route: m.route });
    }
    return items;
  }

  if (state.mode === 'fuzzy' && state.fuzzyResults) {
    const r = state.fuzzyResults;
    for (const c of r.contracts) {
      items.push({
        type: 'contract',
        label: c.name,
        route: `/contracts/A.${c.address}.${c.name}`,
      });
    }
    for (const t of r.tokens) {
      items.push({
        type: 'token',
        label: t.symbol || t.name,
        route: `/tokens/A.${t.address}.${t.contract_name}`,
      });
    }
    for (const n of r.nft_collections) {
      items.push({
        type: 'nft',
        label: n.name,
        route: `/nfts/A.${n.address}.${n.contract_name}`,
      });
    }
  }
  return items;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-nothing-green">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

const kindColor: Record<string, string> = {
  FT: 'bg-nothing-green/10 text-nothing-green',
  NFT: 'bg-purple-500/10 text-purple-400',
  CONTRACT: 'bg-zinc-500/10 text-zinc-400',
  '': 'bg-zinc-500/10 text-zinc-400',
};

export const SearchDropdown = forwardRef<SearchDropdownHandle, SearchDropdownProps>(
  ({ state, onClose, highlightQuery }, ref) => {
    const navigate = useNavigate();
    const activeIndexRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const flatItems = getFlatItems(state);

    useImperativeHandle(ref, () => ({
      activeIndex: activeIndexRef.current,
      totalItems: () => flatItems.length,
      moveUp: () => {
        activeIndexRef.current = Math.max(0, activeIndexRef.current - 1);
        containerRef.current?.querySelector(`[data-idx="${activeIndexRef.current}"]`)?.scrollIntoView({ block: 'nearest' });
        // Force re-render
        containerRef.current?.dispatchEvent(new Event('nav'));
      },
      moveDown: () => {
        activeIndexRef.current = Math.min(flatItems.length - 1, activeIndexRef.current + 1);
        containerRef.current?.querySelector(`[data-idx="${activeIndexRef.current}"]`)?.scrollIntoView({ block: 'nearest' });
        containerRef.current?.dispatchEvent(new Event('nav'));
      },
      selectActive: () => {
        const item = flatItems[activeIndexRef.current];
        if (item?.route) {
          navigate({ to: item.route as any });
          onClose();
        }
      },
    }));

    // Reset index when results change
    useEffect(() => { activeIndexRef.current = 0; }, [state.fuzzyResults, state.quickMatches]);

    // Listen for nav events to force re-render
    const [, forceUpdate] = useState(0);
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const handler = () => forceUpdate((n) => n + 1);
      el.addEventListener('nav', handler);
      return () => el.removeEventListener('nav', handler);
    }, []);

    const isOpen = state.mode !== 'idle' && (state.isLoading || state.error || flatItems.length > 0 || state.mode === 'fuzzy');
    if (!isOpen) return null;

    const navigateTo = (route: string) => {
      navigate({ to: route as any });
      onClose();
    };

    return (
      <div
        ref={containerRef}
        className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-sm shadow-2xl z-50 max-h-[420px] overflow-y-auto"
      >
        {/* Loading */}
        {state.isLoading && (
          <div className="p-3 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-white/5 rounded-sm animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {state.error && (
          <div className="p-3 text-xs text-zinc-500">Search unavailable</div>
        )}

        {/* Quick match (64-hex ambiguity) */}
        {state.mode === 'quick-match' && state.quickMatches.length > 0 && (
          <>
            <SectionLabel label="Select Transaction Type" />
            {state.quickMatches.map((m, i) => (
              <ResultRow
                key={m.type}
                idx={i}
                isActive={activeIndexRef.current === i}
                icon={<ArrowRight className="w-3.5 h-3.5" />}
                label={m.label}
                onClick={() => navigateTo(m.route)}
              />
            ))}
          </>
        )}

        {/* Fuzzy search results */}
        {state.mode === 'fuzzy' && !state.isLoading && !state.error && state.fuzzyResults && (
          <>
            {state.fuzzyResults.contracts.length > 0 && (
              <>
                <SectionLabel label="Contracts" />
                {state.fuzzyResults.contracts.map((c, i) => {
                  const globalIdx = i;
                  return (
                    <ResultRow
                      key={`c-${c.address}-${c.name}`}
                      idx={globalIdx}
                      isActive={activeIndexRef.current === globalIdx}
                      icon={<FileCode className="w-3.5 h-3.5" />}
                      label={<HighlightMatch text={c.name} query={highlightQuery} />}
                      sublabel={`${c.address.slice(0, 16)} · ${c.dependent_count} dependents`}
                      badge={c.kind || 'CONTRACT'}
                      badgeClass={kindColor[c.kind] || kindColor['']}
                      onClick={() => navigateTo(`/contracts/A.${c.address}.${c.name}`)}
                    />
                  );
                })}
              </>
            )}

            {state.fuzzyResults.tokens.length > 0 && (
              <>
                <SectionLabel label="Tokens" />
                {state.fuzzyResults.tokens.map((t, i) => {
                  const globalIdx = (state.fuzzyResults?.contracts.length ?? 0) + i;
                  return (
                    <ResultRow
                      key={`t-${t.address}-${t.contract_name}`}
                      idx={globalIdx}
                      isActive={activeIndexRef.current === globalIdx}
                      icon={<Coins className="w-3.5 h-3.5 text-nothing-green" />}
                      label={<HighlightMatch text={t.symbol || t.name} query={highlightQuery} />}
                      sublabel={`${t.name} · ${t.address.slice(0, 16)}`}
                      onClick={() => navigateTo(`/tokens/A.${t.address}.${t.contract_name}`)}
                    />
                  );
                })}
              </>
            )}

            {state.fuzzyResults.nft_collections.length > 0 && (
              <>
                <SectionLabel label="NFT Collections" />
                {state.fuzzyResults.nft_collections.map((n, i) => {
                  const globalIdx =
                    (state.fuzzyResults?.contracts.length ?? 0) +
                    (state.fuzzyResults?.tokens.length ?? 0) + i;
                  return (
                    <ResultRow
                      key={`n-${n.address}-${n.contract_name}`}
                      idx={globalIdx}
                      isActive={activeIndexRef.current === globalIdx}
                      icon={<ImageIcon className="w-3.5 h-3.5 text-purple-400" />}
                      label={<HighlightMatch text={n.name} query={highlightQuery} />}
                      sublabel={`${n.address.slice(0, 16)} · ${n.item_count.toLocaleString()} items`}
                      badge="NFT"
                      badgeClass={kindColor['NFT']}
                      onClick={() => navigateTo(`/nfts/A.${n.address}.${n.contract_name}`)}
                    />
                  );
                })}
              </>
            )}

            {/* No results */}
            {state.fuzzyResults.contracts.length === 0 &&
              state.fuzzyResults.tokens.length === 0 &&
              state.fuzzyResults.nft_collections.length === 0 && (
                <div className="p-3 text-xs text-zinc-500">No results found</div>
              )}
          </>
        )}

        {/* Footer */}
        {flatItems.length > 0 && (
          <div className="px-3 py-2 border-t border-white/5 flex justify-between items-center">
            <span className="text-[10px] text-zinc-600">
              <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">↑</kbd>{' '}
              <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">↓</kbd> Navigate{' '}
              <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">Enter</kbd> Select{' '}
              <kbd className="px-1 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">Esc</kbd> Close
            </span>
            <span className="text-[10px] text-zinc-600">{flatItems.length} results</span>
          </div>
        )}
      </div>
    );
  }
);

SearchDropdown.displayName = 'SearchDropdown';

// --- Sub-components ---

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</span>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

function ResultRow({
  idx,
  isActive,
  icon,
  label,
  sublabel,
  badge,
  badgeClass,
  onClick,
}: {
  idx: number;
  isActive: boolean;
  icon: React.ReactNode;
  label: React.ReactNode;
  sublabel?: string;
  badge?: string;
  badgeClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      data-idx={idx}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left border-l-2 transition-colors ${
        isActive ? 'bg-nothing-green/5 border-l-nothing-green' : 'border-l-transparent hover:bg-white/[0.02]'
      }`}
    >
      <div className="w-7 h-7 rounded-sm bg-white/5 flex items-center justify-center flex-shrink-0 text-zinc-400">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-white truncate">{label}</div>
        {sublabel && <div className="text-[11px] text-zinc-600 truncate">{sublabel}</div>}
      </div>
      {badge && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded-sm uppercase tracking-wider flex-shrink-0 ${badgeClass}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
```

Note: The component uses `forwardRef` + `useImperativeHandle` to expose keyboard navigation to the parent (Header). The `useState` import is missing — add it alongside the existing imports from `react`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket/frontend && bunx tsc --noEmit --pretty 2>&1 | head -20`
Expected: no new errors (may need to fix import of `useState`)

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/SearchDropdown.tsx
git commit -m "feat(search): add SearchDropdown component with grouped results and keyboard nav"
```

---

## Chunk 4: Header Integration

### Task 6: Integrate dropdown into Header

**Files:**
- Modify: `frontend/app/components/Header.tsx`

- [ ] **Step 1: Add imports and hook**

At the top of `Header.tsx`, add imports:

```typescript
import { useSearch } from '../hooks/useSearch';
import { SearchDropdown, type SearchDropdownHandle } from './SearchDropdown';
```

- [ ] **Step 2: Wire up the search hook and dropdown in `Header()`**

Inside the `Header` function component:

1. Add the hook and refs:
```typescript
const searchState = useSearch();
const dropdownRef = useRef<SearchDropdownHandle>(null);
const searchWrapRef = useRef<HTMLDivElement>(null);
```

2. Add `onChange` handler — update `searchQuery` AND call `searchState.search()`:
```typescript
onChange={(e) => {
  setSearchQuery(e.target.value);
  searchState.search(e.target.value);
}}
```

3. Add `onKeyDown` handler on the input to intercept ↑↓/Enter/Esc when dropdown is open:
```typescript
onKeyDown={(e) => {
  if (searchState.mode === 'idle') return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    dropdownRef.current?.moveDown();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    dropdownRef.current?.moveUp();
  } else if (e.key === 'Enter' && searchState.mode !== 'idle' && (dropdownRef.current?.totalItems() ?? 0) > 0) {
    e.preventDefault();
    dropdownRef.current?.selectActive();
    setSearchQuery('');
    searchState.reset();
  } else if (e.key === 'Escape') {
    searchState.reset();
  }
}}
```

4. Modify `handleSearch` — when mode is `quick-match` or `fuzzy` with results, don't do the old direct-jump. The `onKeyDown` Enter handler above takes over. The existing `handleSearch` on form submit only fires when the dropdown is idle (deterministic single-match).

Add at the top of `handleSearch`:
```typescript
if (searchState.mode !== 'idle' && (dropdownRef.current?.totalItems() ?? 0) > 0) {
  dropdownRef.current?.selectActive();
  setSearchQuery('');
  searchState.reset();
  return;
}
```

5. Render the dropdown inside the search form's `<div className="relative group">`:
```tsx
<SearchDropdown
  ref={dropdownRef}
  state={searchState}
  onClose={() => { setSearchQuery(''); searchState.reset(); }}
  highlightQuery={searchQuery.trim()}
/>
```

6. Add click-outside handler to close dropdown:
```typescript
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
      searchState.reset();
    }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [searchState.reset]);
```

Add `ref={searchWrapRef}` to the `<div className="relative group">` wrapper.

7. Update placeholder text:
```
"Search by block / tx / address / contract name"
```

- [ ] **Step 3: Clear search on navigation**

After `navigate()` calls and after dropdown selection, always call:
```typescript
setSearchQuery('');
searchState.reset();
```

The existing `setSearchQuery('')` calls at the end of each branch in `handleSearch` should stay. Add `searchState.reset()` after each one.

- [ ] **Step 4: Verify lint and TypeScript compile**

Run:
```bash
cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket/frontend
bunx tsc --noEmit --pretty 2>&1 | head -20
bun run lint 2>&1 | tail -20
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/app/components/Header.tsx
git commit -m "feat(search): integrate SearchDropdown into Header with keyboard navigation"
```

---

## Chunk 5: Manual Testing & Polish

### Task 7: Manual testing checklist

- [ ] **Step 1: Start backend and frontend locally**

```bash
# Terminal 1: backend (or use docker compose)
cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket
docker compose up -d backend db

# Terminal 2: frontend dev
cd /Users/hao/clawd/agents/fw-cs/flowscan-clone/.claude/worktrees/harmonic-floating-locket/frontend
bun run dev
```

- [ ] **Step 2: Test fuzzy search**

1. Type "Flow" in search bar → expect dropdown with Contracts/Tokens/NFTs groups
2. Type "TopShot" → expect NFT collection results
3. Type "USDC" → expect token results
4. Type "xy" (no match) → expect "No results found"

- [ ] **Step 3: Test deterministic searches (no dropdown)**

1. Paste a block height (e.g., `12345`) → Enter → direct jump to block page
2. Paste a Flow address (e.g., `0x1654653399040a61`) → Enter → direct jump to account page
3. Paste a public key (128 hex) → Enter → direct jump to key page

- [ ] **Step 4: Test 64-hex ambiguity**

1. Paste a 64-char hex string → dropdown shows "Cadence Transaction" and "EVM Transaction"
2. Arrow down to EVM → Enter → navigates to EVM tx page
3. First item (Cadence) should be highlighted by default

- [ ] **Step 5: Test keyboard navigation**

1. Type "Flow" → use ↑↓ to move between items → Enter selects highlighted item
2. Esc closes dropdown
3. Click outside closes dropdown

- [ ] **Step 6: Test edge cases**

1. Type "a" (1 char) → no dropdown (minimum 2 chars)
2. Type "0xAB" → fuzzy search (doesn't match any pattern length)
3. Rapid typing → only last query triggers API call (debounce working)
4. Clear input → dropdown closes

- [ ] **Step 7: Fix any issues found and commit**

```bash
git add -u
git commit -m "fix(search): polish dropdown behavior from manual testing"
```
