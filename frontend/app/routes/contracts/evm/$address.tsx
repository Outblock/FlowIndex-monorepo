import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Code,
  FileJson,
  Binary,
  BookOpen,
  PenTool,
  List,
  ArrowLeftRight,
  Layers,
  ShieldCheck,
  ShieldOff,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { CopyButton } from '@/components/animate-ui/components/buttons/copy';
import { getEVMSmartContract } from '@/api/evm';
import { formatWei } from '@/lib/evmUtils';
import type { BSSmartContract } from '@/types/blockscout';

// Lazy-load heavy components
const EVMContractSource = lazy(() =>
  import('@/components/evm/EVMContractSource').then((m) => ({ default: m.EVMContractSource }))
);
const EVMContractABI = lazy(() =>
  import('@/components/evm/EVMContractABI').then((m) => ({ default: m.EVMContractABI }))
);
const EVMContractReadWrite = lazy(() =>
  import('@/components/evm/EVMContractReadWrite').then((m) => ({ default: m.EVMContractReadWrite }))
);
const EVMTransactionList = lazy(() =>
  import('@/components/evm/EVMTransactionList').then((m) => ({ default: m.EVMTransactionList }))
);
const EVMTokenTransfers = lazy(() =>
  import('@/components/evm/EVMTokenTransfers').then((m) => ({ default: m.EVMTokenTransfers }))
);
const EVMInternalTxList = lazy(() =>
  import('@/components/evm/EVMInternalTxList').then((m) => ({ default: m.EVMInternalTxList }))
);

type DetailTab = 'source' | 'abi' | 'bytecode' | 'read' | 'write' | 'txs' | 'transfers' | 'internal';
const VALID_TABS: DetailTab[] = ['source', 'abi', 'bytecode', 'read', 'write', 'txs', 'transfers', 'internal'];

const TABS: Array<{
  value: DetailTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  verifiedOnly?: boolean;
}> = [
  { value: 'source', label: 'Source', icon: Code, verifiedOnly: true },
  { value: 'abi', label: 'ABI', icon: FileJson, verifiedOnly: true },
  { value: 'bytecode', label: 'Bytecode', icon: Binary },
  { value: 'read', label: 'Read', icon: BookOpen, verifiedOnly: true },
  { value: 'write', label: 'Write', icon: PenTool, verifiedOnly: true },
  { value: 'txs', label: 'Transactions', icon: List },
  { value: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { value: 'internal', label: 'Internal Txs', icon: Layers },
];

interface EVMContractSearch {
  tab?: DetailTab;
}

export const Route = createFileRoute('/contracts/evm/$address')({
  component: EVMContractDetail,
  validateSearch: (search: Record<string, unknown>): EVMContractSearch => {
    const tab = search.tab as string;
    return {
      tab: VALID_TABS.includes(tab as DetailTab) ? (tab as DetailTab) : undefined,
    };
  },
  loader: async ({ params }) => {
    try {
      const contract = await getEVMSmartContract(params.address);
      return { contract, error: null };
    } catch (e) {
      console.error('Failed to load EVM contract', e);
      return { contract: null, error: 'Failed to load contract details' };
    }
  },
});

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
    </div>
  );
}

function BytecodeBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return (
      <div className="border border-white/10 bg-nothing-dark p-4">
        <div className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-2">{label}</div>
        <p className="text-sm text-zinc-500 italic">Not available</p>
      </div>
    );
  }
  return (
    <div className="border border-white/10 bg-nothing-dark overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/5">
        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">{label}</span>
        <CopyButton content={value} />
      </div>
      <pre className="p-4 text-xs font-mono text-zinc-300 break-all whitespace-pre-wrap overflow-auto max-h-64 leading-relaxed">
        {value}
      </pre>
    </div>
  );
}

function EVMContractDetail() {
  const { address } = Route.useParams();
  const { tab: searchTab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { contract: initialContract, error: initialError } = Route.useLoaderData();

  const [contract, setContract] = useState<BSSmartContract | null>(initialContract);
  const [error, setError] = useState<string | null>(initialError);
  const [clientLoading, setClientLoading] = useState(false);

  // Client-side fallback if SSR timed out
  useEffect(() => {
    if (initialContract || initialError) return;
    let cancelled = false;
    setClientLoading(true);
    getEVMSmartContract(address)
      .then((c) => {
        if (cancelled) return;
        setContract(c);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load contract');
      })
      .finally(() => {
        if (!cancelled) setClientLoading(false);
      });
    return () => { cancelled = true; };
  }, [address, initialContract, initialError]);

  const isVerified = contract?.is_verified ?? false;

  // Default tab: source if verified, bytecode if not
  const defaultTab: DetailTab = isVerified ? 'source' : 'bytecode';
  const activeTab: DetailTab = searchTab || defaultTab;

  function setTab(tab: DetailTab) {
    navigate({ search: { tab }, replace: true });
  }

  const balance = contract?.coin_balance ? formatWei(contract.coin_balance) : '0';
  const displayAddress = address.startsWith('0x') ? address : `0x${address}`;

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back link */}
        <Link
          to="/contracts"
          search={{ tab: 'evm' }}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors font-mono"
        >
          <ArrowLeft className="h-4 w-4" />
          EVM Contracts
        </Link>

        {clientLoading && (
          <div className="flex items-center gap-3 py-8 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-mono">Loading contract…</span>
          </div>
        )}

        {error && !clientLoading && (
          <div className="border border-red-500/30 bg-red-900/10 px-4 py-3 text-sm text-red-400 font-mono">
            {error}
          </div>
        )}

        {contract && (
          <>
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="border border-white/10 bg-nothing-dark px-5 py-4 space-y-3"
            >
              {/* Name + verification badge */}
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg font-semibold font-mono text-zinc-100 truncate">
                      {contract.name || 'Unnamed Contract'}
                    </h1>
                    {isVerified ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-green-900/30 border border-green-500/30 text-nothing-green"
                        title={`Verified at ${contract.verified_at ?? ''}`}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono bg-yellow-900/20 border border-yellow-500/20 text-yellow-400">
                        <ShieldOff className="h-3 w-3" />
                        Unverified
                      </span>
                    )}
                  </div>

                  {/* Address row */}
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="font-mono text-sm text-zinc-400 break-all">{displayAddress}</span>
                    <CopyButton content={displayAddress} />
                    <a
                      href={`https://evm.flowscan.io/address/${displayAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-zinc-600 hover:text-zinc-400 transition-colors"
                      title="View on Blockscout"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>

                {/* Right side: balance + verify CTA */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="text-right">
                    <span className="text-xs text-zinc-500 font-mono uppercase tracking-wider">Balance</span>
                    <div className="text-sm font-mono text-zinc-200">
                      {balance} <span className="text-zinc-500">FLOW</span>
                    </div>
                  </div>
                  {!isVerified && (
                    <a
                      href={`https://evm.flowscan.io/address/${displayAddress}#code`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-nothing-green/40 text-nothing-green hover:bg-nothing-green/10 transition-colors rounded-sm"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      Verify &amp; Publish
                    </a>
                  )}
                </div>
              </div>

              {/* Meta row */}
              {(contract.compiler_version || contract.language || contract.tx_count != null) && (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-mono text-zinc-500 border-t border-white/10 pt-3">
                  {contract.language && (
                    <span>
                      <span className="text-zinc-600 uppercase tracking-wider mr-1">Language:</span>
                      <span className="text-zinc-400">{contract.language}</span>
                    </span>
                  )}
                  {contract.compiler_version && (
                    <span>
                      <span className="text-zinc-600 uppercase tracking-wider mr-1">Compiler:</span>
                      <span className="text-zinc-400">{contract.compiler_version}</span>
                    </span>
                  )}
                  {contract.tx_count != null && (
                    <span>
                      <span className="text-zinc-600 uppercase tracking-wider mr-1">Transactions:</span>
                      <span className="text-zinc-400">{contract.tx_count.toLocaleString()}</span>
                    </span>
                  )}
                </div>
              )}
            </motion.div>

            {/* Tabs */}
            <div className="border-b border-white/10">
              <div className="flex overflow-x-auto gap-0">
                {TABS.map((tab) => {
                  const disabled = tab.verifiedOnly && !isVerified;
                  const isActive = activeTab === tab.value;
                  const Icon = tab.icon;

                  if (disabled) {
                    return (
                      <div
                        key={tab.value}
                        title="Contract not verified"
                        className="relative flex items-center gap-1.5 px-4 py-3 text-sm font-mono text-zinc-600 cursor-not-allowed whitespace-nowrap select-none"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={tab.value}
                      onClick={() => setTab(tab.value)}
                      className={`relative flex items-center gap-1.5 px-4 py-3 text-sm font-mono whitespace-nowrap transition-colors ${
                        isActive
                          ? 'text-nothing-green'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                      {isActive && (
                        <motion.div
                          layoutId="evm-contract-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-nothing-green"
                          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {activeTab === 'source' && (
                  <Suspense fallback={<LoadingSpinner />}>
                    <EVMContractSource contract={contract} />
                  </Suspense>
                )}

                {activeTab === 'abi' && (
                  <Suspense fallback={<LoadingSpinner />}>
                    <EVMContractABI contract={contract} />
                  </Suspense>
                )}

                {activeTab === 'bytecode' && (
                  <div className="space-y-4">
                    <BytecodeBlock label="Creation Bytecode" value={contract.creation_bytecode} />
                    <BytecodeBlock label="Deployed Bytecode" value={contract.deployed_bytecode} />
                  </div>
                )}

                {activeTab === 'read' && (
                  <Suspense fallback={<LoadingSpinner />}>
                    <EVMContractReadWrite address={displayAddress} mode="read" />
                  </Suspense>
                )}

                {activeTab === 'write' && (
                  <Suspense fallback={<LoadingSpinner />}>
                    <EVMContractReadWrite address={displayAddress} mode="write" />
                  </Suspense>
                )}

                {activeTab === 'txs' && (
                  <Suspense fallback={<LoadingSpinner />}>
                    <EVMTransactionList address={displayAddress} />
                  </Suspense>
                )}

                {activeTab === 'transfers' && (
                  <Suspense fallback={<LoadingSpinner />}>
                    <EVMTokenTransfers address={displayAddress} />
                  </Suspense>
                )}

                {activeTab === 'internal' && (
                  <Suspense fallback={<LoadingSpinner />}>
                    <EVMInternalTxList address={displayAddress} />
                  </Suspense>
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
