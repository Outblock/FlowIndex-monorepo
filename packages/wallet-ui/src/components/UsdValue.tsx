import { cn } from '../lib/utils';

export interface UsdValueProps {
  value: number;
  className?: string;
  compact?: boolean;
}

export function UsdValue({ value, className, compact = false }: UsdValueProps) {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value < 0.01 ? 4 : 2,
    maximumFractionDigits: value < 0.01 ? 4 : 2,
    notation: compact && value >= 10_000 ? 'compact' : 'standard',
  }).format(value);

  return <span className={cn('tabular-nums', className)}>{formatted}</span>;
}
