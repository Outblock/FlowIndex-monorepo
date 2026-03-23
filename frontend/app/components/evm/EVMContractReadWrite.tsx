import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Play, Loader2 } from 'lucide-react';
import {
  getEVMSmartContractMethodsRead,
  getEVMSmartContractMethodsWrite,
  queryEVMSmartContractReadMethod,
} from '@/api/evm';
import type { BSContractMethod } from '@/types/blockscout';

interface EVMContractReadWriteProps {
  address: string;
  mode: 'read' | 'write';
}

interface MethodState {
  expanded: boolean;
  inputs: Record<string, string>;
  loading: boolean;
  result: unknown;
  error: string | null;
  txHash: string | null;
}

function encodeABIArgs(method: BSContractMethod, inputs: Record<string, string>): string {
  // Best-effort ABI encoding for write methods
  // For simple types, encode as hex. For complex types, pass raw.
  const args = method.inputs.map((inp) => inputs[inp.name] ?? '');
  // Encode method selector (first 4 bytes of keccak256)
  // We use a simplified approach: build the calldata as the method signature + encoded params
  // Since we can't use ethers/viem here, we do minimal encoding for common types
  // Method selector: we can't compute keccak256 without a library, so use method_id directly
  const selector = method.method_id.startsWith('0x') ? method.method_id : `0x${method.method_id}`;

  if (method.inputs.length === 0) return selector;

  // For each arg, encode based on type
  const encodedArgs = args.map((arg, idx) => {
    const type = method.inputs[idx]?.type ?? '';
    return encodeABIArg(arg, type);
  });

  return selector + encodedArgs.join('');
}

function encodeABIArg(value: string, type: string): string {
  // Simplified ABI encoding for common Solidity types
  const v = value.trim();

  if (type === 'address') {
    const hex = v.replace(/^0x/, '').toLowerCase();
    return hex.padStart(64, '0');
  }

  if (type === 'bool') {
    return (v === 'true' || v === '1' ? '1' : '0').padStart(64, '0');
  }

  if (type.startsWith('uint') || type.startsWith('int')) {
    const num = BigInt(v);
    const hex = num.toString(16);
    return hex.padStart(64, '0');
  }

  if (type === 'bytes32') {
    const hex = v.replace(/^0x/, '');
    return hex.padEnd(64, '0');
  }

  if (type === 'bytes' || type === 'string') {
    // Dynamic type — simplified, just pass as-is hex for MVP
    const encoder = new TextEncoder();
    const bytes = type === 'string' ? encoder.encode(v) : hexToBytes(v);
    const lenHex = bytes.length.toString(16).padStart(64, '0');
    const dataHex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .padEnd(Math.ceil(bytes.length / 32) * 64, '0');
    // Offset for dynamic type (simplified, assumes single arg)
    return '0000000000000000000000000000000000000000000000000000000000000020' + lenHex + dataHex;
  }

  // Fallback: treat as hex
  const hex = v.replace(/^0x/, '');
  return hex.padStart(64, '0');
}

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function formatResult(result: unknown): string {
  if (result === null || result === undefined) return 'null';
  if (typeof result === 'object') return JSON.stringify(result, null, 2);
  return String(result);
}

function MethodCard({
  method,
  state,
  onToggle,
  onInputChange,
  onAction,
  mode,
}: {
  method: BSContractMethod;
  state: MethodState;
  onToggle: () => void;
  onInputChange: (name: string, value: string) => void;
  onAction: () => void;
  mode: 'read' | 'write';
}) {
  const hasInputs = method.inputs.length > 0;
  const isPayable = method.stateMutability === 'payable';

  return (
    <div className="border border-white/10 rounded-sm overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-4 py-3 bg-zinc-900/40 hover:bg-zinc-800/50 transition-colors text-left"
        onClick={onToggle}
      >
        {state.expanded ? (
          <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
        )}
        <span className="text-sm font-medium text-zinc-100">{method.name}</span>
        <span className="ml-auto font-mono text-[10px] text-zinc-500 bg-zinc-800 border border-white/10 px-1.5 py-0.5 rounded">
          {method.method_id}
        </span>
        {method.stateMutability && (
          <span
            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
              method.stateMutability === 'view' || method.stateMutability === 'pure'
                ? 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                : method.stateMutability === 'payable'
                  ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10'
                  : 'border-orange-500/30 text-orange-400 bg-orange-500/10'
            }`}
          >
            {method.stateMutability}
          </span>
        )}
      </button>

      {/* Body */}
      {state.expanded && (
        <div className="px-4 py-3 bg-zinc-950/30 space-y-3 border-t border-white/10">
          {/* Inputs */}
          {hasInputs && (
            <div className="space-y-2">
              {method.inputs.map((inp) => (
                <div key={inp.name} className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-zinc-200 font-medium">{inp.name || '_'}</span>
                    <span className="text-zinc-500 font-mono">({inp.type})</span>
                  </label>
                  <input
                    type="text"
                    placeholder={inp.type}
                    value={state.inputs[inp.name] ?? ''}
                    onChange={(e) => onInputChange(inp.name, e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-sm px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Payable value input */}
          {mode === 'write' && isPayable && (
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[11px]">
                <span className="text-zinc-200 font-medium">value</span>
                <span className="text-zinc-500 font-mono">(FLOW in wei)</span>
              </label>
              <input
                type="text"
                placeholder="0"
                value={state.inputs['__value__'] ?? ''}
                onChange={(e) => onInputChange('__value__', e.target.value)}
                className="w-full bg-zinc-900 border border-white/10 rounded-sm px-3 py-1.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20"
              />
            </div>
          )}

          {/* Action button */}
          <div>
            <button
              onClick={onAction}
              disabled={state.loading}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-colors ${
                mode === 'read'
                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 disabled:opacity-50'
                  : 'bg-orange-600/20 border border-orange-500/30 text-orange-300 hover:bg-orange-600/30 disabled:opacity-50'
              }`}
            >
              {state.loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {mode === 'read' ? 'Query' : 'Write'}
            </button>
          </div>

          {/* Result */}
          {state.result !== undefined && state.result !== null && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Result</div>
              <pre className="bg-zinc-900 border border-white/10 rounded-sm px-3 py-2 text-[11px] font-mono text-green-300 overflow-x-auto whitespace-pre-wrap break-all">
                {formatResult(state.result)}
              </pre>
            </div>
          )}

          {/* Error */}
          {state.error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-sm px-3 py-2 text-xs text-red-400">
              {state.error}
            </div>
          )}

          {/* Tx hash */}
          {state.txHash && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Transaction</div>
              <div className="font-mono text-[11px] text-green-300 break-all">{state.txHash}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EVMContractReadWrite({ address, mode }: EVMContractReadWriteProps) {
  const [methods, setMethods] = useState<BSContractMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [methodStates, setMethodStates] = useState<Record<string, MethodState>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMethods([]);
    setMethodStates({});

    const fetcher =
      mode === 'read' ? getEVMSmartContractMethodsRead : getEVMSmartContractMethodsWrite;

    fetcher(address)
      .then((res) => {
        if (cancelled) return;
        setMethods(res);
        const initial: Record<string, MethodState> = {};
        res.forEach((m) => {
          initial[m.method_id] = {
            expanded: false,
            inputs: {},
            loading: false,
            result: undefined,
            error: null,
            txHash: null,
          };
        });
        setMethodStates(initial);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || `Failed to load ${mode} methods`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, mode]);

  const toggleMethod = (methodId: string) => {
    setMethodStates((prev) => ({
      ...prev,
      [methodId]: {
        ...prev[methodId],
        expanded: !prev[methodId]?.expanded,
      },
    }));
  };

  const setInput = (methodId: string, name: string, value: string) => {
    setMethodStates((prev) => ({
      ...prev,
      [methodId]: {
        ...prev[methodId],
        inputs: { ...prev[methodId]?.inputs, [name]: value },
      },
    }));
  };

  const handleAction = async (method: BSContractMethod) => {
    const state = methodStates[method.method_id];
    if (!state) return;

    if (mode === 'read') {
      setMethodStates((prev) => ({
        ...prev,
        [method.method_id]: { ...prev[method.method_id], loading: true, error: null, result: undefined },
      }));

      try {
        const args = method.inputs.map((inp) => state.inputs[inp.name] ?? '');
        const result = await queryEVMSmartContractReadMethod(address, {
          method_id: method.method_id,
          args,
        });
        setMethodStates((prev) => ({
          ...prev,
          [method.method_id]: { ...prev[method.method_id], loading: false, result },
        }));
      } catch (e: any) {
        setMethodStates((prev) => ({
          ...prev,
          [method.method_id]: {
            ...prev[method.method_id],
            loading: false,
            error: e?.message || 'Query failed',
          },
        }));
      }
    } else {
      // Write mode
      const hasEthereum =
        typeof window !== 'undefined' && !!(window as any).ethereum;

      if (!hasEthereum) {
        setMethodStates((prev) => ({
          ...prev,
          [method.method_id]: {
            ...prev[method.method_id],
            error: 'Connect a wallet to write (window.ethereum not found)',
          },
        }));
        return;
      }

      setMethodStates((prev) => ({
        ...prev,
        [method.method_id]: { ...prev[method.method_id], loading: true, error: null, txHash: null },
      }));

      try {
        const ethereum = (window as any).ethereum;
        const accounts: string[] = await ethereum.request({ method: 'eth_requestAccounts' });
        const from = accounts[0];

        const data = encodeABIArgs(method, state.inputs);
        const valueHex =
          method.stateMutability === 'payable' && state.inputs['__value__']
            ? '0x' + BigInt(state.inputs['__value__']).toString(16)
            : '0x0';

        const txHash: string = await ethereum.request({
          method: 'eth_sendTransaction',
          params: [
            {
              from,
              to: address,
              data,
              value: valueHex,
            },
          ],
        });

        setMethodStates((prev) => ({
          ...prev,
          [method.method_id]: { ...prev[method.method_id], loading: false, txHash },
        }));
      } catch (e: any) {
        setMethodStates((prev) => ({
          ...prev,
          [method.method_id]: {
            ...prev[method.method_id],
            loading: false,
            error: e?.message || 'Write failed',
          },
        }));
      }
    }
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border border-white/10 rounded-sm px-4 py-3 animate-pulse bg-zinc-900/40"
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 bg-zinc-700 rounded" />
              <div className="h-4 w-40 bg-zinc-700 rounded" />
              <div className="ml-auto h-4 w-16 bg-zinc-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <p className="text-sm">No {mode} methods found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-4">
      {methods.map((method) => (
        <MethodCard
          key={method.method_id}
          method={method}
          state={
            methodStates[method.method_id] ?? {
              expanded: false,
              inputs: {},
              loading: false,
              result: undefined,
              error: null,
              txHash: null,
            }
          }
          onToggle={() => toggleMethod(method.method_id)}
          onInputChange={(name, value) => setInput(method.method_id, name, value)}
          onAction={() => handleAction(method)}
          mode={mode}
        />
      ))}
    </div>
  );
}
