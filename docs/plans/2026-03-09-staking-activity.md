# Staking Activity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add staking activity history (grouped by epoch) to the account detail Staking tab, and fix the transfer diagram to show "Stake" instead of "Burn" for staking transactions.

**Architecture:** Backend adds a new repository method to query `staking_events` by account address (via joins to `staking_delegators` and `staking_nodes`), a new API endpoint, and a new DB index. Frontend adds an activity section below the existing staking cards in `AccountStakingTab.tsx`. Transfer diagram fix recognizes staking contract addresses.

**Tech Stack:** Go (backend API + repo), PostgreSQL, React 19, TanStack Start, TailwindCSS

---

### Task 1: Database — Add index for address-based staking event queries

**Files:**
- Modify: `backend/schema_v2.sql` (after existing staking indexes, around line 879)

**Step 1: Add the index**

Add after the existing `idx_staking_events_type` index:

```sql
CREATE INDEX IF NOT EXISTS idx_staking_events_delegator ON app.staking_events(node_id, delegator_id);
```

**Step 2: Commit**

```bash
git add backend/schema_v2.sql
git commit -m "feat(schema): add staking_events delegator index for address queries"
```

---

### Task 2: Backend — Repository method `ListStakingEventsByAddress`

**Files:**
- Modify: `backend/internal/repository/staking.go`

**Step 1: Add the method**

Add after `ListStakingEventsByTypeLike` (line ~468):

```go
// ListStakingEventsByAddress returns staking events for an account address.
// It joins through staking_delegators (for delegators) and staking_nodes (for operators).
func (r *Repository) ListStakingEventsByAddress(ctx context.Context, address string, limit, offset int) ([]models.StakingEvent, error) {
	addrBytes := hexToBytes(address)
	query := `
		WITH account_roles AS (
			SELECT DISTINCT node_id, delegator_id
			FROM (
				SELECT node_id, delegator_id FROM app.staking_delegators WHERE address = $1
				UNION ALL
				SELECT node_id, 0 AS delegator_id FROM app.staking_nodes WHERE address = $1
			) sub
		)
		SELECT se.block_height, encode(se.transaction_id, 'hex') AS transaction_id,
			se.event_index, se.event_type, COALESCE(se.node_id, ''),
			COALESCE(se.delegator_id, 0), COALESCE(se.amount, 0)::TEXT, se.timestamp
		FROM app.staking_events se
		JOIN account_roles ar ON se.node_id = ar.node_id
			AND (ar.delegator_id = 0 OR se.delegator_id = ar.delegator_id)
		ORDER BY se.block_height DESC, se.event_index DESC
		LIMIT $2 OFFSET $3`

	rows, err := r.db.Query(ctx, query, addrBytes, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("list staking events by address: %w", err)
	}
	defer rows.Close()

	var events []models.StakingEvent
	for rows.Next() {
		var e models.StakingEvent
		if err := rows.Scan(
			&e.BlockHeight, &e.TransactionID,
			&e.EventIndex, &e.EventType, &e.NodeID,
			&e.DelegatorID, &e.Amount, &e.Timestamp,
		); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: success

**Step 3: Commit**

```bash
git add backend/internal/repository/staking.go
git commit -m "feat(repo): add ListStakingEventsByAddress for account staking activity"
```

---

### Task 3: Backend — API handler + route for account staking activity

**Files:**
- Modify: `backend/internal/api/v1_handlers_staking.go`
- Modify: `backend/internal/api/routes_registration.go`

**Step 1: Add the handler**

Add to `v1_handlers_staking.go` after `handleStakingAccountTransactions` (line ~226):

```go
// handleAccountStakingActivity handles GET /flow/account/{address}/staking/activity
func (s *Server) handleAccountStakingActivity(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	address := normalizeAddress(vars["address"])
	if address == "" {
		writeAPIError(w, http.StatusBadRequest, "address is required")
		return
	}

	limit, offset := parseLimitOffset(r)
	if limit > 100 {
		limit = 100
	}

	events, err := s.repo.ListStakingEventsByAddress(r.Context(), address, limit, offset)
	if err != nil {
		writeAPIError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Build epoch lookup from epoch_stats for the block height range in results
	epochMap := make(map[uint64]models.EpochStats)
	if len(events) > 0 {
		// Get recent epoch stats (enough to cover the result set)
		epochStats, _ := s.repo.ListEpochStats(r.Context(), 200, 0)
		for _, es := range epochStats {
			epochMap[uint64(es.Epoch)] = es
		}
	}

	out := make([]interface{}, 0, len(events))
	for _, e := range events {
		item := map[string]interface{}{
			"block_height":   e.BlockHeight,
			"transaction_id": e.TransactionID,
			"event_index":    e.EventIndex,
			"event_type":     e.EventType,
			"node_id":        e.NodeID,
			"delegator_id":   e.DelegatorID,
			"amount":         e.Amount,
			"timestamp":      formatTime(e.Timestamp),
		}
		// Find epoch for this block height
		for _, es := range epochMap {
			if uint64(es.StartHeight) <= e.BlockHeight && (es.EndHeight == 0 || e.BlockHeight <= uint64(es.EndHeight)) {
				item["epoch"] = es.Epoch
				item["epoch_start"] = formatTime(es.StartTime)
				item["epoch_end"] = formatTime(es.EndTime)
				break
			}
		}
		out = append(out, item)
	}

	writeAPIResponse(w, out, map[string]interface{}{
		"limit":  limit,
		"offset": offset,
	}, nil)
}
```

**Step 2: Register the route**

In `routes_registration.go`, add inside `registerFlowRoutes` (after line 150, near other account routes):

```go
r.HandleFunc("/flow/account/{address}/staking/activity", s.handleAccountStakingActivity).Methods("GET", "OPTIONS")
```

**Step 3: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: success

**Step 4: Commit**

```bash
git add backend/internal/api/v1_handlers_staking.go backend/internal/api/routes_registration.go
git commit -m "feat(api): add GET /flow/account/{address}/staking/activity endpoint"
```

---

### Task 4: Frontend — Staking Activity section in AccountStakingTab

**Files:**
- Modify: `frontend/app/components/account/AccountStakingTab.tsx`

**Step 1: Add the activity section**

Add imports at the top (merge with existing):
```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { Landmark, Server, Users, Lock, Gift, ArrowDownToLine, ArrowUpFromLine, Clock, History, ExternalLink, Loader2 } from 'lucide-react';
```

Add the `ensureHeyApiConfigured` import and `resolveApiBaseUrl`:
```tsx
import { resolveApiBaseUrl } from '../../api';
```

Add event type display mapping constants (after `ROLE_COLORS`):

```tsx
const EVENT_LABELS: Record<string, string> = {
    TokensCommitted: 'Staked',
    DelegatorTokensCommitted: 'Staked',
    TokensStaked: 'Restaked',
    DelegatorTokensStaked: 'Restaked',
    TokensUnstaking: 'Unstaking',
    DelegatorTokensUnstaking: 'Unstaking',
    TokensUnstaked: 'Unstaked',
    DelegatorTokensUnstaked: 'Unstaked',
    RewardsPaid: 'Reward',
    DelegatorRewardsPaid: 'Reward',
    NewNodeCreated: 'Node Created',
    NewDelegatorCreated: 'Delegator Created',
};

const EVENT_COLORS: Record<string, string> = {
    Staked: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30',
    Restaked: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30',
    Unstaking: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30',
    Unstaked: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10 border-red-200 dark:border-red-500/30',
    Reward: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30',
    'Node Created': 'text-zinc-500 bg-zinc-50 dark:text-zinc-400 dark:bg-white/5 border-zinc-200 dark:border-white/10',
    'Delegator Created': 'text-zinc-500 bg-zinc-50 dark:text-zinc-400 dark:bg-white/5 border-zinc-200 dark:border-white/10',
};
```

Add the `StakingActivitySection` component (before the main `AccountStakingTab` export):

```tsx
function StakingActivitySection({ address }: { address: string }) {
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const loadingRef = useRef(false);

    const loadMore = useCallback(async () => {
        if (loadingRef.current || !hasMore) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            const baseUrl = await resolveApiBaseUrl();
            const res = await fetch(`${baseUrl}/flow/account/${encodeURIComponent(address)}/staking/activity?limit=50&offset=${offset}`);
            if (!res.ok) throw new Error('Failed to load staking activity');
            const json = await res.json();
            const items: any[] = json?.data ?? [];
            setEvents(prev => [...prev, ...items]);
            setOffset(prev => prev + items.length);
            setHasMore(items.length >= 50);
        } catch (err) {
            console.error('Failed to load staking activity', err);
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [address, offset, hasMore]);

    useEffect(() => {
        loadMore();
    }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    if (events.length === 0 && !loading) return null;

    // Group events by epoch
    const grouped = new Map<number | string, { epoch: number | null; epochStart?: string; epochEnd?: string; events: any[] }>();
    for (const evt of events) {
        const epoch = evt.epoch ?? null;
        const key = epoch ?? 'unknown';
        if (!grouped.has(key)) {
            grouped.set(key, { epoch, epochStart: evt.epoch_start, epochEnd: evt.epoch_end, events: [] });
        }
        grouped.get(key)!.events.push(evt);
    }

    return (
        <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <History className="w-3.5 h-3.5" />
                Staking Activity
            </h4>

            {[...grouped.entries()].map(([key, group]) => (
                <div key={String(key)}>
                    {/* Epoch divider */}
                    <div className="flex items-center gap-2 mb-2">
                        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                        <span className="text-[10px] font-mono text-zinc-400 whitespace-nowrap">
                            {group.epoch != null ? `Epoch #${group.epoch}` : 'Unknown Epoch'}
                            {group.epochStart && group.epochEnd && (
                                <> · {new Date(group.epochStart).toLocaleDateString()} – {new Date(group.epochEnd).toLocaleDateString()}</>
                            )}
                        </span>
                        <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                    </div>

                    {/* Event rows */}
                    <div className="space-y-1">
                        {group.events.map((evt: any, i: number) => {
                            const label = EVENT_LABELS[evt.event_type] || evt.event_type;
                            const colorClass = EVENT_COLORS[label] || EVENT_COLORS['Node Created'];
                            const amount = parseFloat(evt.amount) || 0;
                            return (
                                <div key={`${evt.block_height}-${evt.event_index}-${i}`}
                                    className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-black/20 border border-zinc-100 dark:border-white/5 rounded-sm hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                                >
                                    {/* Badge */}
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border shrink-0 ${colorClass}`}>
                                        {label}
                                    </span>

                                    {/* Amount */}
                                    {amount > 0 && (
                                        <span className="text-sm font-mono font-bold text-zinc-900 dark:text-white shrink-0">
                                            {amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                            <span className="text-[10px] font-normal text-zinc-500 ml-1">FLOW</span>
                                        </span>
                                    )}

                                    {/* Node/Delegator info */}
                                    <span className="text-[10px] text-zinc-400 font-mono truncate">
                                        {evt.node_id ? `Node ${evt.node_id.slice(0, 12)}...` : ''}
                                        {evt.delegator_id > 0 ? ` · Delegator #${evt.delegator_id}` : ''}
                                    </span>

                                    {/* Spacer */}
                                    <div className="flex-1" />

                                    {/* Timestamp + link */}
                                    <span className="text-[10px] text-zinc-400 shrink-0">
                                        {new Date(evt.timestamp).toLocaleString()}
                                    </span>
                                    <a href={`/txs/${evt.transaction_id}`}
                                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Loading / Load more */}
            {loading && (
                <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
                </div>
            )}
            {hasMore && !loading && events.length > 0 && (
                <button
                    onClick={loadMore}
                    className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-white/10 rounded-sm hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                >
                    Load more
                </button>
            )}
        </div>
    );
}
```

**Step 2: Add the section to the main component**

In the `AccountStakingTab` component's JSX, add `<StakingActivitySection>` right before the closing `</>` of the `{!loading && !error && (...)}` block, after the empty state section:

```tsx
                    {/* Staking Activity History */}
                    <StakingActivitySection address={normalizedAddress} />
```

**Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add frontend/app/components/account/AccountStakingTab.tsx
git commit -m "feat(frontend): add staking activity history section to staking tab"
```

---

### Task 5: Frontend — Fix transfer diagram for staking transactions

**Files:**
- Modify: `frontend/app/components/tx/TransferFlowDiagram.tsx`

**Step 1: Fix the label**

In `transfersToFlows()`, after the cross-VM pre-processing block and before the aggregation loop, add staking contract recognition. The staking contract address on mainnet is `8624b52f9ddcd04a`. When a transfer has no `to_address` (would be "Burn") but the transaction events include `FlowIDTableStaking`, relabel it as "Stake".

Actually, the simpler fix: in the aggregation section where we create synthetic nodes, check if the `to_address` is the staking contract. If the transfer has no `to_address` (burn), we can't detect staking from ft_transfers alone.

The real issue: for staking transactions, `from_address` is the user and `to_address` is empty (tokens go into the staking contract vault which isn't tracked as a regular address). So it shows as "Burn".

The cleanest fix: check if the transaction has staking-related events by looking at `detail.events` for `FlowIDTableStaking` types. If found, relabel empty-to transfers as "Stake" instead of "Burn".

In `transfersToFlows()`, add this detection before the main FT loop:

```typescript
    // Detect staking transactions: if events include FlowIDTableStaking, relabel burns as "Stake"
    const isStakingTx = (detail?.events || []).some((evt: any) =>
        typeof evt?.type === 'string' && evt.type.includes('FlowIDTableStaking')
    );
```

Then in the aggregation section, change the synthetic node logic:

```typescript
        const from = rawFrom || `MINT:${sym}`;
        const to = rawTo || (isStakingTx ? `STAKE:${sym}` : `BURN:${sym}`);
        const fromLabel = rawFrom ? formatShort(rawFrom, 8, 4) : 'Mint';
        const toLabel = rawTo ? formatShort(rawTo, 8, 4) : (isStakingTx ? 'Stake' : 'Burn');
```

Also update `isSynthetic` in `layoutGraph` to recognize `STAKE:`:

```typescript
    const isSynthetic = (addr: string) => addr.startsWith('MINT:') || addr.startsWith('BURN:') || addr.startsWith('DEX:') || addr.startsWith('STAKE:');
```

And add styling for STAKE nodes (same green as MINT — staking is a positive action):

In `placeColumn`, update the color logic for synthetic node labels:
```typescript
color: addr.startsWith('MINT:') ? (isDark ? '#4ade80' : '#16a34a') :
       addr.startsWith('BURN:') ? (isDark ? '#f87171' : '#dc2626') :
       addr.startsWith('STAKE:') ? (isDark ? '#60a5fa' : '#2563eb') :
       (isDark ? '#e4e4e7' : '#27272a')
```

And the border color:
```typescript
border: addr.startsWith('MINT:')
    ? (isDark ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(22,163,74,0.3)')
    : addr.startsWith('BURN:')
        ? (isDark ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(220,38,38,0.3)')
        : addr.startsWith('STAKE:')
            ? (isDark ? '1px solid rgba(96,165,250,0.3)' : '1px solid rgba(37,99,235,0.3)')
            : nodeStyle.border,
```

And the edge color logic (in the edges section):
```typescript
        const hasStake = to.startsWith('STAKE:');
        const stakeColor = isDark ? '#60a5fa' : '#2563eb';
        const color = hasBurn ? burnColor : hasMint ? mintColor : hasStake ? stakeColor : hasNft && group.length === 1 ? nftColor : accentColor;
```

**Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add frontend/app/components/tx/TransferFlowDiagram.tsx
git commit -m "fix(frontend): show Stake instead of Burn in transfer diagram for staking txs"
```

---

### Task 6: Verify end-to-end

**Step 1: Build backend**

Run: `cd backend && go build ./...`
Expected: success

**Step 2: Build frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: success

**Step 3: Commit all remaining changes if any**

Ensure clean working tree.
