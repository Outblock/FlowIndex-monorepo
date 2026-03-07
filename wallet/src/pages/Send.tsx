import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GlassCard,
  TokenIcon,
  UsdValue,
  Button,
  Input,
  cn,
  formatShort,
} from '@flowindex/flow-ui';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ExternalLink,
  Fingerprint,
  Loader2,
  Send as SendIcon,
  Wallet,
  X,
} from 'lucide-react';
import * as fcl from '@onflow/fcl';
import { createPasskeyAuthz } from '@flowindex/flow-passkey';

import { useWallet } from '@/hooks/useWallet';
import {
  getAccount,
  getTokenPrices,
} from '@/api/flow';
import type { AccountData, VaultInfo } from '@/api/flow';
import { FLOW_TRANSFER_TX, MAINNET_ALIASES, TESTNET_ALIASES } from '@/cadence/scripts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RP_ID = import.meta.env.VITE_RP_ID || 'flowindex.io';

/** Minimum FLOW to keep for storage (0.001 FLOW) */
const MIN_STORAGE_RESERVE = 0.001;

const FLOW_ADDRESS_RE = /^0x[0-9a-fA-F]{16}$/;

type Step = 'form' | 'review' | 'signing' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TokenOption {
  id: string;
  name: string;
  symbol: string;
  logo?: string;
  balance: number;
  path?: string;
}

function isValidFlowAddress(addr: string): boolean {
  return FLOW_ADDRESS_RE.test(addr);
}

/** Format a UFix64 amount (8 decimal places, no trailing zeros beyond 2). */
function formatUFix64(n: number): string {
  return n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '.0');
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-white/10', className)} />
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TokenSelector({
  tokens,
  selected,
  onSelect,
}: {
  tokens: TokenOption[];
  selected: TokenOption | null;
  onSelect: (t: TokenOption) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!selected) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 transition-colors text-left"
      >
        <TokenIcon
          logoUrl={selected.logo}
          name={selected.name}
          symbol={selected.symbol}
          size={32}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{selected.name}</p>
          <p className="text-xs text-zinc-500">{selected.symbol}</p>
        </div>
        <div className="text-right mr-2">
          <p className="text-sm font-mono text-zinc-300">
            {selected.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-zinc-500 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-lg">
          {tokens.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelect(t);
                setOpen(false);
              }}
              className={cn(
                'flex items-center gap-3 w-full px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left',
                t.id === selected.id && 'bg-zinc-800/30',
              )}
            >
              <TokenIcon
                logoUrl={t.logo}
                name={t.name}
                symbol={t.symbol}
                size={28}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{t.name}</p>
              </div>
              <p className="text-sm font-mono text-zinc-400">
                {t.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </p>
              {t.id === selected.id && (
                <Check className="w-4 h-4 text-nothing-green flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Send Page
// ---------------------------------------------------------------------------

export default function Send() {
  const { activeAccount, network, loading: walletLoading } = useWallet();

  // Data
  const [account, setAccount] = useState<AccountData | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [dataLoading, setDataLoading] = useState(false);

  // Form state
  const [selectedToken, setSelectedToken] = useState<TokenOption | null>(null);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [txId, setTxId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const address =
    network === 'testnet'
      ? activeAccount?.flowAddressTestnet
      : activeAccount?.flowAddress;

  // -------------------------------------------------------------------------
  // Fetch account data + prices
  // -------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    if (!address) return;
    setDataLoading(true);
    try {
      const [acct, tokenPrices] = await Promise.allSettled([
        getAccount(address),
        getTokenPrices(),
      ]);
      if (acct.status === 'fulfilled') setAccount(acct.value);
      if (tokenPrices.status === 'fulfilled') setPrices(tokenPrices.value);
    } finally {
      setDataLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -------------------------------------------------------------------------
  // Build token list from account vaults
  // -------------------------------------------------------------------------

  const tokens: TokenOption[] = useMemo(() => {
    const result: TokenOption[] = [];

    // Always include FLOW
    const flowBalance = account?.flowBalance ?? 0;
    result.push({
      id: 'FLOW',
      name: 'Flow',
      symbol: 'FLOW',
      logo: undefined,
      balance: flowBalance,
    });

    // Add other vaults
    const vaults = account?.vaults;
    if (vaults) {
      for (const [, v] of Object.entries(vaults) as [string, VaultInfo][]) {
        if (v.symbol === 'FLOW') continue;
        const balance = v.balance ?? 0;
        if (balance <= 0) continue;
        result.push({
          id: v.token ?? v.path ?? v.symbol ?? '',
          name: v.name ?? v.symbol ?? '',
          symbol: v.symbol ?? '',
          logo: v.logo,
          balance,
          path: v.path,
        });
      }
    }

    return result;
  }, [account]);

  // Auto-select FLOW when tokens change
  useEffect(() => {
    if (tokens.length > 0 && !selectedToken) {
      setSelectedToken(tokens[0]);
    }
  }, [tokens, selectedToken]);

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const parsedAmount = parseFloat(amount);
  const isFlowToken = selectedToken?.id === 'FLOW';
  const maxBalance = selectedToken?.balance ?? 0;
  const maxSendable = isFlowToken
    ? Math.max(0, maxBalance - MIN_STORAGE_RESERVE)
    : maxBalance;

  const tokenPrice =
    prices[selectedToken?.symbol ?? ''] ??
    prices[(selectedToken?.symbol ?? '').toUpperCase()] ??
    0;
  const usdAmount = !isNaN(parsedAmount) ? parsedAmount * tokenPrice : 0;

  const recipientError = useMemo(() => {
    if (!recipient) return null;
    if (!isValidFlowAddress(recipient)) {
      return 'Invalid Flow address (expected 0x followed by 16 hex characters)';
    }
    if (address && recipient.toLowerCase() === `0x${address}`.toLowerCase()) {
      return 'Cannot send to yourself';
    }
    return null;
  }, [recipient, address]);

  const amountError = useMemo(() => {
    if (!amount) return null;
    if (isNaN(parsedAmount) || parsedAmount <= 0) return 'Enter a valid amount';
    if (parsedAmount > maxSendable) {
      return isFlowToken
        ? `Exceeds max sendable (${maxSendable.toLocaleString()} FLOW, reserving ${MIN_STORAGE_RESERVE} for storage)`
        : `Exceeds available balance (${maxSendable.toLocaleString()})`;
    }
    return null;
  }, [amount, parsedAmount, maxSendable, isFlowToken]);

  const canReview =
    !!recipient &&
    !recipientError &&
    !!amount &&
    !amountError &&
    parsedAmount > 0 &&
    !!selectedToken;

  // -------------------------------------------------------------------------
  // Transaction submission
  // -------------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    if (!activeAccount || !address || !selectedToken) return;

    // Currently only FLOW transfers are supported
    if (!isFlowToken) {
      setError('Only FLOW transfers are supported in this version.');
      setStep('error');
      return;
    }

    setStep('signing');
    setError(null);

    try {
      // Configure FCL for this transaction
      const accessNode =
        network === 'testnet'
          ? 'https://rest-testnet.onflow.org'
          : 'https://rest-mainnet.onflow.org';

      const aliases = network === 'testnet' ? TESTNET_ALIASES : MAINNET_ALIASES;

      fcl.config().put('accessNode.api', accessNode);
      for (const [alias, addr] of Object.entries(aliases)) {
        fcl.config().put(alias, addr);
      }

      // Create the passkey authz function
      const authz = createPasskeyAuthz({
        address: `0x${address}`,
        keyIndex: 0,
        credentialId: activeAccount.credentialId,
        rpId: RP_ID,
      });

      // Submit the transaction
      const txResult = await fcl.mutate({
        cadence: FLOW_TRANSFER_TX,
        args: (arg: typeof fcl.arg, t: typeof fcl.t) => [
          arg(formatUFix64(parsedAmount), t.UFix64),
          arg(recipient, t.Address),
        ],
        proposer: authz,
        payer: authz,
        authorizations: [authz],
        limit: 9999,
      });

      setTxId(txResult);
      setStep('success');

      // Optionally wait for sealing (non-blocking)
      fcl.tx(txResult).onceSealed().catch(() => {
        // Ignore — the tx was already submitted successfully
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed';
      // Don't show error for user cancellation
      if (message.includes('cancelled') || message.includes('canceled')) {
        setStep('review');
        return;
      }
      setError(message);
      setStep('error');
    }
  }, [activeAccount, address, selectedToken, isFlowToken, network, parsedAmount, recipient]);

  const reset = useCallback(() => {
    setRecipient('');
    setAmount('');
    setTxId(null);
    setError(null);
    setStep('form');
  }, []);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  const explorerBase =
    network === 'testnet'
      ? 'https://testnet.flowindex.io'
      : 'https://flowindex.io';

  // No account
  if (!walletLoading && !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-zinc-500" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">No Account Found</h2>
        <p className="text-sm text-zinc-400 max-w-xs">
          Create or connect a Flow account to send tokens.
        </p>
      </div>
    );
  }

  const loading = walletLoading || dataLoading;

  // -------------------------------------------------------------------------
  // Success view
  // -------------------------------------------------------------------------

  if (step === 'success') {
    return (
      <div className="space-y-6">
        <GlassCard className="rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-nothing-green/10 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-nothing-green" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Transaction Submitted</h2>
          <p className="text-sm text-zinc-400 mb-6">
            Your transfer of{' '}
            <span className="font-mono text-white">
              {parsedAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })}{' '}
              {selectedToken?.symbol}
            </span>{' '}
            to{' '}
            <span className="font-mono text-white">
              {formatShort(recipient, 6, 4)}
            </span>{' '}
            has been submitted to the network.
          </p>

          {txId && (
            <a
              href={`${explorerBase}/tx/${txId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-nothing-green hover:text-nothing-green/80 transition-colors font-mono mb-6"
            >
              {formatShort(txId, 8, 6)}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={reset}
              className="border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
            >
              Send Another
            </Button>
            {txId && (
              <Button
                asChild
                className="bg-nothing-green hover:bg-nothing-green/90 text-black font-semibold"
              >
                <a
                  href={`${explorerBase}/tx/${txId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Explorer
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            )}
          </div>
        </GlassCard>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error view
  // -------------------------------------------------------------------------

  if (step === 'error') {
    return (
      <div className="space-y-6">
        <GlassCard className="rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Transaction Failed</h2>
          <p className="text-sm text-red-400 font-mono mb-6 max-w-md mx-auto break-all">
            {error}
          </p>
          <div className="flex gap-3 justify-center">
            <Button
              variant="outline"
              onClick={reset}
              className="border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
            >
              Start Over
            </Button>
            <Button
              onClick={() => setStep('review')}
              className="bg-nothing-green hover:bg-nothing-green/90 text-black font-semibold"
            >
              Try Again
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Review view
  // -------------------------------------------------------------------------

  if (step === 'review') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('form')}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Review Transaction</h1>
        </div>

        <GlassCard className="rounded-2xl p-6 space-y-4">
          {/* Token + Amount */}
          <div className="text-center py-4">
            <div className="flex items-center justify-center gap-3 mb-3">
              <TokenIcon
                logoUrl={selectedToken?.logo}
                name={selectedToken?.name ?? ''}
                symbol={selectedToken?.symbol ?? ''}
                size={40}
              />
            </div>
            <p className="text-3xl font-bold text-white font-mono">
              {parsedAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })}{' '}
              <span className="text-lg text-zinc-400 font-normal">
                {selectedToken?.symbol}
              </span>
            </p>
            {usdAmount > 0 && (
              <UsdValue value={usdAmount} className="text-base mt-1" />
            )}
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-zinc-400">From</span>
              <span className="text-sm font-mono text-white">
                0x{formatShort(address ?? '', 6, 4)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-zinc-400">To</span>
              <span className="text-sm font-mono text-white">
                {formatShort(recipient, 6, 4)}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-white/5">
              <span className="text-sm text-zinc-400">Network</span>
              <span className="text-sm text-white capitalize">{network}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-zinc-400">Estimated Fee</span>
              <span className="text-sm font-mono text-zinc-300">&lt; 0.001 FLOW</span>
            </div>
          </div>
        </GlassCard>

        {/* Sign button */}
        <Button
          onClick={handleSend}
          disabled={step === 'signing'}
          className="w-full h-12 bg-nothing-green hover:bg-nothing-green/90 text-black font-semibold text-base"
        >
          {step === 'signing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Awaiting Passkey...
            </>
          ) : (
            <>
              <Fingerprint className="w-5 h-5 mr-2" />
              Sign &amp; Send
            </>
          )}
        </Button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Signing overlay (shown during signing state)
  // -------------------------------------------------------------------------

  if (step === 'signing') {
    return (
      <div className="space-y-6">
        <GlassCard className="rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-nothing-green/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Fingerprint className="w-8 h-8 text-nothing-green" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Confirm with Passkey</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Use your passkey to sign this transaction.
          </p>
          <Loader2 className="w-6 h-6 animate-spin text-nothing-green mx-auto" />
        </GlassCard>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Form view (default)
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SendIcon className="w-5 h-5 text-nothing-green" />
        <h1 className="text-lg font-semibold text-white">Send Tokens</h1>
      </div>

      {loading ? (
        <GlassCard className="rounded-2xl p-6 space-y-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </GlassCard>
      ) : (
        <GlassCard className="rounded-2xl p-6 space-y-5">
          {/* Token selector */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Token</label>
            <TokenSelector
              tokens={tokens}
              selected={selectedToken}
              onSelect={setSelectedToken}
            />
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Recipient</label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x0000000000000000"
              className={cn(
                'bg-zinc-900/50 border-zinc-800 text-white font-mono placeholder:text-zinc-600 h-12',
                recipientError && recipient && 'border-red-500/50',
              )}
              spellCheck={false}
              autoComplete="off"
            />
            {recipientError && recipient && (
              <p className="text-xs text-red-400 mt-1.5">{recipientError}</p>
            )}
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-zinc-400">Amount</label>
              <button
                type="button"
                onClick={() => setAmount(String(maxSendable))}
                className="text-xs text-nothing-green hover:text-nothing-green/80 transition-colors font-mono"
              >
                Max: {maxSendable.toLocaleString(undefined, { maximumFractionDigits: 4 })}
              </button>
            </div>
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="any"
                className={cn(
                  'bg-zinc-900/50 border-zinc-800 text-white font-mono placeholder:text-zinc-600 h-12 pr-20',
                  amountError && amount && 'border-red-500/50',
                )}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-500 font-mono">
                {selectedToken?.symbol}
              </span>
            </div>
            {amountError && amount && (
              <p className="text-xs text-red-400 mt-1.5">{amountError}</p>
            )}
            {usdAmount > 0 && !amountError && (
              <UsdValue value={usdAmount} className="text-xs mt-1.5" />
            )}
          </div>

          {/* Only FLOW is supported notice */}
          {selectedToken && !isFlowToken && (
            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-xs text-amber-400">
                Only FLOW transfers are currently supported. Support for other tokens is coming soon.
              </p>
            </div>
          )}
        </GlassCard>
      )}

      {/* Review button */}
      <Button
        onClick={() => setStep('review')}
        disabled={!canReview || !isFlowToken || loading}
        className="w-full h-12 bg-nothing-green hover:bg-nothing-green/90 text-black font-semibold text-base disabled:opacity-40"
      >
        <ArrowUpRight className="w-5 h-5 mr-2" />
        Review Transaction
      </Button>
    </div>
  );
}
