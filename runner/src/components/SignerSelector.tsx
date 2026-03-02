import { useState, useRef, useEffect } from 'react';
import { Wallet, Key, ChevronDown } from 'lucide-react';
import type { UserKey } from '../auth/useKeys';

export type SignerOption =
  | { type: 'fcl' }
  | { type: 'custodial'; key: UserKey };

interface SignerSelectorProps {
  keys: UserKey[];
  selected: SignerOption;
  onSelect: (option: SignerOption) => void;
}

export default function SignerSelector({ keys, selected, onSelect }: SignerSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function truncateAddress(addr: string) {
    if (addr.length <= 10) return addr;
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  const label = selected.type === 'fcl'
    ? 'FCL Wallet'
    : `${selected.key.label || 'Key'} (${truncateAddress(selected.key.flow_address)})`;

  const icon = selected.type === 'fcl'
    ? <Wallet className="w-3 h-3" />
    : <Key className="w-3 h-3" />;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-2 py-1 rounded border border-zinc-700 transition-colors"
      >
        {icon}
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded shadow-lg z-50">
          {/* FCL option */}
          <button
            onClick={() => { onSelect({ type: 'fcl' }); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-700 transition-colors ${
              selected.type === 'fcl' ? 'text-emerald-400' : 'text-zinc-300'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            FCL Wallet
          </button>

          {/* Custodial key options */}
          {keys.map((key) => (
            <button
              key={key.id}
              onClick={() => { onSelect({ type: 'custodial', key }); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-700 transition-colors ${
                selected.type === 'custodial' && selected.key.id === key.id ? 'text-emerald-400' : 'text-zinc-300'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span className="truncate">{key.label || 'Key'}</span>
              <span className="text-zinc-500 ml-auto">{truncateAddress(key.flow_address)}</span>
            </button>
          ))}

          {keys.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-zinc-500">
              No custodial keys. Open key manager to create one.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
