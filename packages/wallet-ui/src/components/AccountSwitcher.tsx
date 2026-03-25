import { cn } from '../lib/utils';

export interface AccountSwitcherAccount {
  id: string;
  name?: string;
  address?: string;
}

export interface AccountSwitcherProps {
  accounts: AccountSwitcherAccount[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  className?: string;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 13) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function AccountSwitcher({ accounts, activeId, onSwitch, className }: AccountSwitcherProps) {
  const active = accounts.find((a) => a.id === activeId);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {accounts.map((account) => (
        <button
          key={account.id}
          onClick={() => onSwitch(account.id)}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
            account.id === activeId
              ? 'bg-wallet-primary/10 text-wallet-primary'
              : 'hover:bg-wallet-card-hover text-wallet-muted',
          )}
        >
          <div className="w-8 h-8 rounded-full bg-wallet-card flex items-center justify-center text-sm">
            {(account.name ?? 'A').charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {account.name ?? 'Account'}
            </span>
            {account.address && (
              <span className="text-xs text-wallet-muted font-mono">
                {truncateAddress(account.address)}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
