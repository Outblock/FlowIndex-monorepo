import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Box, Hash, ArrowRight, ExternalLink } from 'lucide-react';
import { CopyButton } from '@/components/animate-ui/components/buttons/copy';
import { formatRelativeTime, formatAbsoluteTime } from '@/lib/time';
import { formatWei, formatGas, txStatusLabel } from '@/lib/evmUtils';
import { AddressLink } from '@/components/AddressLink';
import { EVMInternalTxList } from '@/components/evm/EVMInternalTxList';
import { EVMLogsList } from '@/components/evm/EVMLogsList';
import { EVMTokenTransfers } from '@/components/evm/EVMTokenTransfers';
import DecryptedText from '@/components/ui/DecryptedText';
import { useTimeTicker } from '@/hooks/useTimeTicker';
import type { BSTransaction } from '@/types/blockscout';

type TabId = 'internal' | 'logs' | 'transfers';

const TABS: { id: TabId; label: string }[] = [
  { id: 'internal', label: 'Internal Transactions' },
  { id: 'logs', label: 'Logs' },
  { id: 'transfers', label: 'Token Transfers' },
];

function txTypeLabel(type: number): string {
  if (type === 2) return 'EIP-1559';
  if (type === 1) return 'EIP-2930';
  return 'Legacy';
}

export function EVMTxDetail({ tx }: { tx: BSTransaction }) {
  const [activeTab, setActiveTab] = useState<TabId>('internal');
  const status = txStatusLabel(tx.status);
  const nowTick = useTimeTicker();

  const gasPercent = tx.gas_limit && tx.gas_limit !== '0'
    ? ((Number(tx.gas_used) / Number(tx.gas_limit)) * 100).toFixed(1)
    : null;

  const txTimeAbsolute = formatAbsoluteTime(tx.timestamp);
  const txTimeRelative = formatRelativeTime(tx.timestamp, nowTick);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-zinc-900 dark:text-zinc-300 font-mono selection:bg-nothing-green selection:text-black transition-colors duration-300">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Back Button */}
        <button onClick={() => window.history.back()} className="inline-flex items-center space-x-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-8 group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs uppercase tracking-widest">Back</span>
        </button>

        {/* Header Card */}
        <div className="border border-zinc-200 dark:border-white/10 p-8 mb-8 relative overflow-hidden bg-white dark:bg-nothing-dark shadow-sm dark:shadow-none">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Box className="h-32 w-32" />
          </div>

          <div className="relative z-10">
            {/* Badges */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4 flex-wrap">
              <span className={`text-xs uppercase tracking-[0.2em] border px-2 py-1 rounded-sm w-fit font-bold ${
                tx.status === 'ok'
                  ? 'text-nothing-green border-nothing-green/30 bg-nothing-green/5'
                  : 'text-red-500 border-red-500/30 bg-red-500/5'
              }`}>
                {status.label}
              </span>
              <span className="text-blue-600 dark:text-blue-400 text-xs uppercase tracking-[0.2em] border border-blue-400/30 px-2 py-1 rounded-sm w-fit">
                EVM
              </span>
              <span className="text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-[0.2em] border border-zinc-300 dark:border-white/20 px-2 py-1 rounded-sm w-fit">
                {txTypeLabel(tx.type)}
              </span>
            </div>

            {/* TX Hash */}
            <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white mb-1 break-all flex items-center gap-1 group">
              <DecryptedText
                text={tx.hash}
                animateOn="view"
                sequential
                revealDirection="start"
                speed={25}
                maxIterations={12}
                characters="█▓▒░╳╱╲◆◇●○■□▪▫#@$%&*!?~^"
                startEncrypted
                className="font-mono"
              />
              <CopyButton
                content={tx.hash}
                variant="ghost"
                size="xs"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />
              <a
                href={`https://evm.flowindex.io/tx/${tx.hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                title="View on Blockscout"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </h1>
            <p className="text-zinc-500 text-xs uppercase tracking-widest">EVM Transaction Hash</p>

            {/* Divider + Grid Info */}
            <div className="border-t border-zinc-200 dark:border-white/10 mt-6 pt-6">
              {/* Row 1: Timestamp, Block, Gas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Timestamp</p>
                  <span className="text-sm text-zinc-600 dark:text-zinc-300">{txTimeAbsolute || 'N/A'}</span>
                  {txTimeRelative && (
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                      {txTimeRelative}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Block</p>
                  <Link
                    to={`/blocks/${tx.block_number}` as any}
                    className="text-sm text-zinc-900 dark:text-white hover:text-nothing-green-dark dark:hover:text-nothing-green transition-colors font-mono"
                  >
                    {tx.block_number.toLocaleString()}
                  </Link>
                  {tx.confirmations > 0 && (
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {tx.confirmations.toLocaleString()} confirmations
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Gas Used</p>
                  <span className="text-sm text-zinc-600 dark:text-zinc-300 font-mono">
                    {formatGas(tx.gas_used)} / {formatGas(tx.gas_limit)}
                  </span>
                  {gasPercent && (
                    <div className="text-[10px] text-zinc-500 mt-0.5">{gasPercent}%</div>
                  )}
                </div>
              </div>

              {/* Row 2: Value, Gas Price, Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Value</p>
                  <span className="text-sm text-zinc-600 dark:text-zinc-300 font-mono font-medium">{formatWei(tx.value)} FLOW</span>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Gas Price</p>
                  <span className="text-sm text-zinc-600 dark:text-zinc-300 font-mono">{formatWei(tx.gas_price, 9, 4)} Gwei</span>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Transaction Fee</p>
                  <span className="text-sm text-zinc-600 dark:text-zinc-300 font-mono">{formatWei(tx.fee.value)} FLOW</span>
                </div>
              </div>

              {/* Row 3: From, To, Nonce */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="group">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">From</p>
                  <div className="bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/5 p-2.5 flex items-center gap-1 hover:border-nothing-green-dark/30 dark:hover:border-nothing-green/30 transition-colors rounded-sm">
                    <AddressLink address={tx.from.hash} prefixLen={20} suffixLen={0} className="text-xs" />
                    <CopyButton
                      content={tx.from.hash}
                      variant="ghost"
                      size="xs"
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    />
                  </div>
                </div>
                <div className="group">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">
                    {tx.to ? 'To' : 'Contract Created'}
                  </p>
                  <div className="bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/5 p-2.5 flex items-center gap-1 hover:border-zinc-300 dark:hover:border-white/20 transition-colors rounded-sm">
                    {tx.to ? (
                      <>
                        <AddressLink address={tx.to.hash} prefixLen={20} suffixLen={0} className="text-xs" />
                        <CopyButton
                          content={tx.to.hash}
                          variant="ghost"
                          size="xs"
                          className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        />
                      </>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">Contract Creation</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Nonce</p>
                  <div className="bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/5 p-2.5 rounded-sm">
                    <span className="text-xs font-mono">{tx.nonce}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decoded Input */}
        {tx.decoded_input && (
          <div className="border border-zinc-200 dark:border-white/10 p-6 mb-8 bg-white dark:bg-nothing-dark shadow-sm dark:shadow-none">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Input Data (Decoded)</p>
            <div className="rounded-sm border border-nothing-green/30 bg-nothing-green/5 p-4 space-y-2">
              <div className="text-xs font-mono font-medium text-zinc-900 dark:text-nothing-green">
                {tx.decoded_input.method_call}
              </div>
              {tx.decoded_input.parameters.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {tx.decoded_input.parameters.map((param, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[11px]">
                      <span className="text-nothing-green-dark dark:text-nothing-green font-medium shrink-0">
                        {param.name}
                      </span>
                      <span className="text-zinc-500 shrink-0">
                        ({param.type})
                      </span>
                      <span className="font-mono text-zinc-800 dark:text-zinc-200 break-all">
                        {param.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Raw Input (when no decoded) */}
        {!tx.decoded_input && tx.raw_input && tx.raw_input !== '0x' && (
          <div className="border border-zinc-200 dark:border-white/10 p-6 mb-8 bg-white dark:bg-nothing-dark shadow-sm dark:shadow-none">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">Raw Input</p>
            <div className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300 break-all bg-zinc-50 dark:bg-black/40 border border-zinc-200 dark:border-white/5 rounded-sm p-3 max-h-40 overflow-y-auto">
              {tx.raw_input}
            </div>
          </div>
        )}

        {/* Revert Reason */}
        {tx.revert_reason && (
          <div className="border border-red-500/30 bg-red-50 dark:bg-red-900/10 p-6 mb-8 rounded-sm">
            <p className="text-[10px] text-red-500 uppercase tracking-wider mb-3">Revert Reason</p>
            <div className="text-xs font-mono text-red-800 dark:text-red-300 break-all">
              {tx.revert_reason}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border border-zinc-200 dark:border-white/10 overflow-hidden bg-white dark:bg-nothing-dark shadow-sm dark:shadow-none">
          <div className="flex border-b border-zinc-200 dark:border-white/10">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3.5 text-xs font-medium transition-colors relative uppercase tracking-wider ${
                  activeTab === tab.id
                    ? 'text-zinc-900 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-nothing-green" />
                )}
              </button>
            ))}
          </div>

          <div>
            {activeTab === 'internal' && <EVMInternalTxList txHash={tx.hash} />}
            {activeTab === 'logs' && <EVMLogsList txHash={tx.hash} />}
            {activeTab === 'transfers' && <EVMTokenTransfers txHash={tx.hash} />}
          </div>
        </div>
      </div>
    </div>
  );
}
