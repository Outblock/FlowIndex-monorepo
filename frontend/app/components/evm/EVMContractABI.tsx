import { FileCode } from 'lucide-react';
import { CopyButton } from '@/components/animate-ui/components/buttons/copy';
import type { BSSmartContract } from '@/types/blockscout';

interface EVMContractABIProps {
  contract: BSSmartContract;
}

export function EVMContractABI({ contract }: EVMContractABIProps) {
  if (!contract.abi || contract.abi.length === 0) {
    return (
      <div className="border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark p-8 text-center">
        <FileCode className="h-10 w-10 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-500 dark:text-zinc-400 text-sm font-mono">No ABI available</p>
      </div>
    );
  }

  const abiText = JSON.stringify(contract.abi, null, 2);

  return (
    <div className="border border-zinc-200 dark:border-white/10 bg-white dark:bg-nothing-dark overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5">
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          <FileCode className="h-3.5 w-3.5" />
          <span>ABI</span>
          <span className="text-zinc-400 dark:text-zinc-600">({contract.abi.length} entries)</span>
        </div>
        <CopyButton text={abiText} />
      </div>

      {/* ABI JSON */}
      <div className="overflow-auto max-h-[600px]">
        <pre className="p-4 text-xs font-mono text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre">
          {abiText}
        </pre>
      </div>
    </div>
  );
}
