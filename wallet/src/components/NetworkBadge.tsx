import { useWallet } from '../hooks/useWallet';
import { cn } from '@flowindex/flow-ui';

export default function NetworkBadge() {
  const { network, switchNetwork } = useWallet();
  const isMainnet = network === 'mainnet';

  return (
    <button
      type="button"
      onClick={() => switchNetwork(isMainnet ? 'testnet' : 'mainnet')}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
        'hover:bg-white/5 cursor-pointer select-none',
        isMainnet ? 'text-emerald-400' : 'text-orange-400',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isMainnet ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.5)]',
        )}
      />
      {isMainnet ? 'Mainnet' : 'Testnet'}
    </button>
  );
}
