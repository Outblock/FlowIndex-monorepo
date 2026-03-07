import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { formatShort, cn } from '@flowindex/flow-ui';
import { ChevronDown, Check } from 'lucide-react';

export default function AccountSwitcher() {
  const { activeAccount, accounts, network, switchAccount } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!activeAccount) {
    return (
      <div className="px-3 py-2 text-xs text-zinc-500">No accounts</div>
    );
  }

  const address =
    network === 'testnet' && activeAccount.flowAddressTestnet
      ? activeAccount.flowAddressTestnet
      : activeAccount.flowAddress;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
          'hover:bg-white/5 text-left',
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate">
            {activeAccount.authenticatorName || 'Passkey'}
          </div>
          <div className="text-xs font-mono text-zinc-500 truncate">
            {formatShort(address, 6, 4)}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-zinc-500 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && accounts.length > 1 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl py-1">
          {accounts.map((acct) => {
            const acctAddr =
              network === 'testnet' && acct.flowAddressTestnet
                ? acct.flowAddressTestnet
                : acct.flowAddress;
            const isActive = acct.credentialId === activeAccount.credentialId;

            return (
              <button
                key={acct.credentialId}
                type="button"
                onClick={() => {
                  switchAccount(acct.credentialId);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
                  'hover:bg-white/5',
                  isActive && 'bg-white/[0.03]',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">
                    {acct.authenticatorName || 'Passkey'}
                  </div>
                  <div className="text-xs font-mono text-zinc-500 truncate">
                    {formatShort(acctAddr, 6, 4)}
                  </div>
                </div>
                {isActive && <Check className="h-4 w-4 text-nothing-green flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
