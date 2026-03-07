import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GlassCard, TokenIcon, UsdValue, Badge, cn, formatShort } from '@flowindex/flow-ui';
import { deriveActivityType, buildSummaryLine } from '@flowindex/flow-ui';
import {
  Copy,
  Check,
  Wallet,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  FileCode,
  UserPlus,
  Key,
  Zap,
  Coins,
  ShoppingBag,
  Clock,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import {
  getAccount,
  getAccountFtHoldings,
  getAccountTransactions,
  getTokenPrices,
} from '@/api/flow';
import type { AccountData, FtHolding, AccountTransaction } from '@/api/flow';

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

/** Simple relative time formatter */
function timeAgo(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Skeleton line placeholder */
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-white/10',
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface VaultWithMeta {
  token: string;
  name: string;
  symbol: string;
  logo?: string;
  balance: number;
  usdValue: number;
}

function FlowBalanceCard({
  flowBalance,
  flowPrice,
  loading,
}: {
  flowBalance: number;
  flowPrice: number;
  loading: boolean;
}) {
  return (
    <GlassCard className="rounded-2xl p-6 col-span-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-nothing-green/20 to-nothing-green/5 flex items-center justify-center">
          <Wallet className="w-6 h-6 text-nothing-green" />
        </div>
        <div>
          <p className="text-sm text-zinc-400">FLOW Balance</p>
          {loading ? (
            <Skeleton className="h-8 w-40 mt-1" />
          ) : (
            <p className="text-3xl font-bold text-white tracking-tight">
              {flowBalance.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}{' '}
              <span className="text-lg text-zinc-400 font-normal">FLOW</span>
            </p>
          )}
        </div>
      </div>
      {!loading && flowPrice > 0 && (
        <UsdValue
          price={flowPrice}
          amount={flowBalance}
          className="text-base"
        />
      )}
    </GlassCard>
  );
}

function FtHoldingsList({
  holdings,
  loading,
}: {
  holdings: VaultWithMeta[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <GlassCard className="rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Token Holdings</h2>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="text-right space-y-2">
                <Skeleton className="h-4 w-20 ml-auto" />
                <Skeleton className="h-3 w-14 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  if (holdings.length === 0) {
    return (
      <GlassCard className="rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Token Holdings</h2>
        <p className="text-zinc-500 text-sm">No token holdings found.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Token Holdings</h2>
      <div className="space-y-3">
        {holdings.map((h) => (
          <div
            key={h.token}
            className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0"
          >
            <TokenIcon
              logoUrl={h.logo}
              name={h.name}
              symbol={h.symbol}
              size={36}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {h.name || h.symbol}
              </p>
              <p className="text-xs text-zinc-500">{h.symbol}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-white">
                {h.balance.toLocaleString(undefined, {
                  maximumFractionDigits: 4,
                })}
              </p>
              {h.usdValue > 0 && (
                <UsdValue value={h.usdValue} className="text-xs" />
              )}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function RecentTransactions({
  transactions,
  loading,
}: {
  transactions: AccountTransaction[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <GlassCard className="rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-14" />
            </div>
          ))}
        </div>
      </GlassCard>
    );
  }

  if (transactions.length === 0) {
    return (
      <GlassCard className="rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        <p className="text-zinc-500 text-sm">No transactions yet.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
        <Link
          to="/activity"
          className="text-xs text-nothing-green hover:text-nothing-green/80 flex items-center gap-1 transition-colors"
        >
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {transactions.map((tx) => {
          const activity = deriveActivityType(tx);
          const Icon = activityIcon(activity.type);
          const summary = buildSummaryLine(tx);

          return (
            <div
              key={tx.id}
              className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0"
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                  activity.bgColor,
                )}
              >
                <Icon className={cn('w-4 h-4', activity.color)} />
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
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] text-zinc-500">
                  {timeAgo(tx.timestamp)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const { activeAccount, network, loading: walletLoading } = useWallet();

  const [account, setAccount] = useState<AccountData | null>(null);
  const [holdings, setHoldings] = useState<FtHolding[]>([]);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const address =
    network === 'testnet'
      ? activeAccount?.flowAddressTestnet
      : activeAccount?.flowAddress;

  const fetchData = useCallback(async () => {
    if (!address) return;
    setDataLoading(true);
    try {
      const [acct, ftHoldings, txPage, tokenPrices] = await Promise.allSettled([
        getAccount(address),
        getAccountFtHoldings(address),
        getAccountTransactions(address, { limit: 5 }),
        getTokenPrices(),
      ]);

      if (acct.status === 'fulfilled') setAccount(acct.value);
      if (ftHoldings.status === 'fulfilled') setHoldings(ftHoldings.value);
      if (txPage.status === 'fulfilled') setTransactions(txPage.value.data);
      if (tokenPrices.status === 'fulfilled') setPrices(tokenPrices.value);
    } finally {
      setDataLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const copyAddress = useCallback(() => {
    if (!address) return;
    navigator.clipboard.writeText(`0x${address}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [address]);

  // Build enriched vault list from account data and holdings
  const flowBalance = account?.flowBalance ?? 0;
  const flowPrice = prices['FLOW'] ?? prices['flow'] ?? 0;

  const enrichedHoldings: VaultWithMeta[] = (() => {
    // Prefer vaults from account data (has metadata), fall back to FT holdings
    const vaults = account?.vaults;
    if (vaults && Object.keys(vaults).length > 0) {
      return Object.entries(vaults)
        .filter(([, v]) => v.symbol !== 'FLOW') // FLOW shown separately
        .map(([, v]) => {
          const balance = v.balance ?? 0;
          const symbol = v.symbol ?? '';
          const price = prices[symbol] ?? prices[symbol.toUpperCase()] ?? 0;
          return {
            token: v.token ?? v.path ?? '',
            name: v.name ?? symbol,
            symbol,
            logo: v.logo,
            balance,
            usdValue: balance * price,
          };
        })
        .filter((v) => v.balance > 0)
        .sort((a, b) => b.usdValue - a.usdValue || b.balance - a.balance);
    }

    // Fall back to raw FT holdings
    return holdings
      .filter((h) => !h.token?.includes('FlowToken'))
      .map((h) => {
        const balance = Number(h.balance ?? 0);
        const tokenName = h.token?.split('.').pop() ?? '';
        return {
          token: h.token ?? '',
          name: tokenName,
          symbol: tokenName,
          logo: undefined,
          balance,
          usdValue: 0,
        };
      })
      .filter((v) => v.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  })();

  const totalUsd =
    flowBalance * flowPrice +
    enrichedHoldings.reduce((sum, h) => sum + h.usdValue, 0);

  // No account state
  if (!walletLoading && !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">No Account Found</h2>
        <p className="text-sm text-zinc-400 max-w-xs">
          Create or connect a Flow account to view your dashboard.
        </p>
      </div>
    );
  }

  const loading = walletLoading || dataLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-400 mb-1">Account</p>
          {address ? (
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-mono text-white">
                0x{formatShort(address, 6, 4)}
              </h1>
              <button
                onClick={copyAddress}
                className="text-zinc-500 hover:text-nothing-green transition-colors"
                title="Copy full address"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-nothing-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <a
                href={`https://flowindex.io/account/0x${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-nothing-green transition-colors"
                title="View on explorer"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : (
            <Skeleton className="h-6 w-48" />
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-zinc-400 mb-1">Portfolio Value</p>
          {loading ? (
            <Skeleton className="h-7 w-28 ml-auto" />
          ) : totalUsd > 0 ? (
            <p className="text-xl font-semibold text-white">
              ${totalUsd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          ) : (
            <p className="text-xl font-semibold text-zinc-500">--</p>
          )}
        </div>
      </div>

      {/* FLOW balance */}
      <FlowBalanceCard
        flowBalance={flowBalance}
        flowPrice={flowPrice}
        loading={loading}
      />

      {/* 2-column grid: holdings + transactions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FtHoldingsList holdings={enrichedHoldings} loading={loading} />
        <RecentTransactions transactions={transactions} loading={loading} />
      </div>
    </div>
  );
}
