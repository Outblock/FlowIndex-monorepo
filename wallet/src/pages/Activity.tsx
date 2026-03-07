import { useCallback, useEffect, useState } from 'react';
import {
  GlassCard,
  Badge,
  Button,
  cn,
  formatShort,
  deriveActivityType,
  buildSummaryLine,
  formatRelativeTime,
} from '@flowindex/flow-ui';
import {
  ArrowRightLeft,
  ArrowDownLeft,
  ShoppingBag,
  UserPlus,
  Key,
  FileCode,
  Zap,
  Coins,
  Clock,
  ExternalLink,
  Loader2,
  History,
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import {
  getAccountTransactions,
  getAccountFtTransfers,
  type AccountTransaction,
  type FtTransfer,
} from '@/api/flow';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

type FilterTab = 'all' | 'ft' | 'nft';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map activity type string to a Lucide icon component */
function activityIcon(type: string) {
  const iconMap: Record<string, React.ElementType> = {
    ft: ArrowRightLeft,
    nft: ShoppingBag,
    account: UserPlus,
    key: Key,
    deploy: FileCode,
    evm: Zap,
    swap: ArrowRightLeft,
    staking: Coins,
    marketplace: ShoppingBag,
    scheduled: Clock,
    contract: FileCode,
    tx: ArrowRightLeft,
  };
  return iconMap[type] ?? ArrowRightLeft;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-white/10', className)} />
  );
}

// ---------------------------------------------------------------------------
// Skeleton row
// ---------------------------------------------------------------------------

function TransactionSkeleton() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5">
      <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-3 w-14 shrink-0" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transaction row
// ---------------------------------------------------------------------------

function TransactionRow({ tx }: { tx: AccountTransaction }) {
  const activity = deriveActivityType(tx);
  const Icon = activityIcon(activity.type);
  const summary = buildSummaryLine(tx);
  const time = formatRelativeTime(tx.timestamp);

  return (
    <a
      href={`https://flowindex.io/tx/${tx.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.03] rounded-lg px-2 -mx-2 transition-colors group"
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
          activity.bgColor,
        )}
      >
        <Icon className={cn('w-4.5 h-4.5', activity.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 h-4 font-medium',
              activity.bgColor,
              activity.color,
            )}
          >
            {activity.label}
          </Badge>
          {tx.status === 'SEALED' && tx.error && (
            <span className="text-[10px] text-red-400">Failed</span>
          )}
        </div>
        <p className="text-xs text-zinc-400 truncate mt-0.5">
          {summary || formatShort(tx.id ?? '')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-zinc-500">{time}</span>
        <ExternalLink className="w-3.5 h-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// FT Transfer row
// ---------------------------------------------------------------------------

function FtTransferRow({ transfer }: { transfer: FtTransfer }) {
  const isSend = transfer.direction === 'out' || transfer.classifier === 'sender';
  const time = formatRelativeTime(transfer.timestamp);
  const symbol = transfer.token?.symbol ?? transfer.token?.name ?? '';
  const amount = transfer.amount ?? 0;
  const counterparty = isSend ? transfer.receiver : transfer.sender;

  return (
    <a
      href={`https://flowindex.io/tx/${transfer.transaction_hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.03] rounded-lg px-2 -mx-2 transition-colors group"
    >
      <div
        className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
          isSend ? 'bg-red-500/10' : 'bg-emerald-500/10',
        )}
      >
        {isSend ? (
          <ArrowRightLeft className="w-4.5 h-4.5 text-red-400" />
        ) : (
          <ArrowDownLeft className="w-4.5 h-4.5 text-emerald-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0 h-4 font-medium',
              isSend
                ? 'bg-red-500/10 text-red-400'
                : 'bg-emerald-500/10 text-emerald-400',
            )}
          >
            {isSend ? 'Sent' : 'Received'}
          </Badge>
          {symbol && (
            <span className="text-[10px] text-zinc-500">{symbol}</span>
          )}
        </div>
        <p className="text-xs text-zinc-400 truncate mt-0.5">
          {counterparty
            ? `${isSend ? 'To' : 'From'} 0x${formatShort(counterparty, 6, 4)}`
            : formatShort(transfer.transaction_hash ?? '')}
        </p>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span
          className={cn(
            'text-sm font-mono',
            isSend ? 'text-red-400' : 'text-emerald-400',
          )}
        >
          {isSend ? '-' : '+'}
          {amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">{time}</span>
          <ExternalLink className="w-3.5 h-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'ft', label: 'FT Transfers' },
  { key: 'nft', label: 'NFT Transfers' },
];

function FilterTabs({
  active,
  onChange,
}: {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
}) {
  return (
    <div className="flex gap-1 bg-white/5 rounded-lg p-1">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
            active === tab.key
              ? 'bg-white/10 text-white'
              : 'text-zinc-500 hover:text-zinc-300',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Activity() {
  const { activeAccount, network, loading: walletLoading } = useWallet();

  const address =
    network === 'testnet'
      ? activeAccount?.flowAddressTestnet
      : activeAccount?.flowAddress;

  const [tab, setTab] = useState<FilterTab>('all');
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [ftTransfers, setFtTransfers] = useState<FtTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when tab or address changes
  const fetchInitial = useCallback(async () => {
    if (!address) {
      setTransactions([]);
      setFtTransfers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setHasMore(false);

    try {
      if (tab === 'all' || tab === 'nft') {
        const page = await getAccountTransactions(address, { limit: PAGE_SIZE, offset: 0 });
        setTransactions(page.data);
        setHasMore(page.hasMore);
        setFtTransfers([]);
      } else {
        const page = await getAccountFtTransfers(address, { limit: PAGE_SIZE, offset: 0 });
        setFtTransfers(page.data);
        setHasMore(page.hasMore);
        setTransactions([]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load activity';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [address, tab]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!address || loadingMore) return;

    setLoadingMore(true);
    try {
      if (tab === 'all' || tab === 'nft') {
        const offset = transactions.length;
        const page = await getAccountTransactions(address, { limit: PAGE_SIZE, offset });
        setTransactions((prev) => [...prev, ...page.data]);
        setHasMore(page.hasMore);
      } else {
        const offset = ftTransfers.length;
        const page = await getAccountFtTransfers(address, { limit: PAGE_SIZE, offset });
        setFtTransfers((prev) => [...prev, ...page.data]);
        setHasMore(page.hasMore);
      }
    } catch {
      // silently fail on load more
    } finally {
      setLoadingMore(false);
    }
  }, [address, tab, transactions.length, ftTransfers.length, loadingMore]);

  // Handle tab change — reset data
  const handleTabChange = useCallback((newTab: FilterTab) => {
    setTab(newTab);
    setTransactions([]);
    setFtTransfers([]);
    setHasMore(false);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // No account
  if (!walletLoading && !address) {
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-xl font-semibold text-white">Activity</h1>
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
          <History className="w-12 h-12" />
          <span className="text-lg">No Account</span>
          <span className="text-sm text-zinc-600">
            Connect a Flow account to view transaction history
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Activity</h1>
        <FilterTabs active={tab} onChange={handleTabChange} />
      </div>

      {/* Loading skeleton */}
      {loading && (
        <GlassCard className="rounded-xl p-4">
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <TransactionSkeleton key={i} />
            ))}
          </div>
        </GlassCard>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-16 text-red-400 text-sm">{error}</div>
      )}

      {/* Empty state */}
      {!loading &&
        !error &&
        transactions.length === 0 &&
        ftTransfers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <History className="w-12 h-12" />
            <span className="text-lg">No activity yet</span>
            <span className="text-sm text-zinc-600">
              {tab === 'ft'
                ? 'No token transfers found for this account'
                : tab === 'nft'
                  ? 'No NFT transfers found for this account'
                  : 'Transactions for this account will appear here'}
            </span>
          </div>
        )}

      {/* Transaction list (All / NFT tabs) */}
      {!loading && !error && transactions.length > 0 && (
        <GlassCard className="rounded-xl p-4">
          <div className="space-y-0">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        </GlassCard>
      )}

      {/* FT Transfer list */}
      {!loading && !error && ftTransfers.length > 0 && (
        <GlassCard className="rounded-xl p-4">
          <div className="space-y-0">
            {ftTransfers.map((t, i) => (
              <FtTransferRow
                key={`${t.transaction_hash}-${t.address}-${i}`}
                transfer={t}
              />
            ))}
          </div>
        </GlassCard>
      )}

      {/* Load More */}
      {!loading && hasMore && (
        <div className="flex justify-center pt-2 pb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            disabled={loadingMore}
            className="gap-2"
          >
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {loadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
