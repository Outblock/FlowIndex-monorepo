import { cn } from '../lib/utils';

export interface TokenIconProps {
  src?: string;
  symbol: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-10 h-10' };
const textSizeMap = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

export function TokenIcon({ src, symbol, size = 'md', className }: TokenIconProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={symbol}
        className={cn(sizeMap[size], 'rounded-full object-cover', className)}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        sizeMap[size],
        textSizeMap[size],
        'rounded-full bg-wallet-card flex items-center justify-center font-medium text-wallet-muted',
        className,
      )}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}
