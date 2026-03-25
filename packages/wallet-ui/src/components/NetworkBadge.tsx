import { cn } from '../lib/utils';

export interface NetworkBadgeProps {
  network: 'mainnet' | 'testnet' | 'emulator';
  className?: string;
}

const networkStyles = {
  mainnet: 'bg-wallet-success/20 text-wallet-success',
  testnet: 'bg-wallet-warning/20 text-wallet-warning',
  emulator: 'bg-wallet-secondary/20 text-wallet-secondary',
};

export function NetworkBadge({ network, className }: NetworkBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        networkStyles[network],
        className,
      )}
    >
      {network}
    </span>
  );
}
