import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BSPageParams } from '@/types/blockscout';

interface CursorPaginationProps {
  nextPageParams: BSPageParams | null;
  hasPrev: boolean;
  isLoading?: boolean;
  onNext: () => void;
  onPrev: () => void;
}

export function CursorPagination({ nextPageParams, hasPrev, isLoading, onNext, onPrev }: CursorPaginationProps) {
  const hasNext = nextPageParams !== null;
  if (!hasNext && !hasPrev) return null;

  return (
    <div className="flex items-center justify-center space-x-4 mt-8">
      <button
        onClick={onPrev}
        disabled={!hasPrev || isLoading}
        className="flex items-center px-4 py-2 border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200 text-zinc-900 dark:text-white"
      >
        <ChevronLeft className="w-4 h-4 mr-2" />
        <span className="text-xs uppercase tracking-widest font-mono">Prev</span>
      </button>

      <div className="flex items-center space-x-1">
        <span className="w-1 h-1 bg-zinc-300 dark:bg-white rounded-full opacity-30" />
        <span className="w-1 h-1 bg-nothing-green rounded-full" />
        <span className="w-1 h-1 bg-zinc-300 dark:bg-white rounded-full opacity-30" />
      </div>

      <button
        onClick={onNext}
        disabled={!hasNext || isLoading}
        className="flex items-center px-4 py-2 border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-200 text-zinc-900 dark:text-white"
      >
        <span className="text-xs uppercase tracking-widest font-mono">Next</span>
        <ChevronRight className="w-4 h-4 ml-2" />
      </button>
    </div>
  );
}
