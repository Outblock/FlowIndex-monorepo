import { useState } from 'react';
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { SimulateResponse } from '../flow/simulate';

interface TransactionPreviewProps {
  loading: boolean;
  result: SimulateResponse | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function TransactionPreview({ loading, result, onConfirm, onCancel }: TransactionPreviewProps) {
  const [eventsExpanded, setEventsExpanded] = useState(false);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-100">Transaction Preview</h3>
        </div>

        {/* Body */}
        <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Simulating transaction...
            </div>
          )}

          {!loading && result && (
            <div className="space-y-3">
              {/* Status header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span className={`text-sm font-medium ${result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.success ? 'Simulation Passed' : 'Simulation Failed'}
                  </span>
                </div>
                {result.computationUsed > 0 && (
                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                    {result.computationUsed.toLocaleString()} computation
                  </span>
                )}
              </div>

              {/* Error message */}
              {result.error && (
                <div className="bg-red-900/20 border border-red-800/50 rounded p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    <pre className="text-xs text-red-400 whitespace-pre-wrap break-all flex-1">{result.error}</pre>
                  </div>
                </div>
              )}

              {/* Balance changes */}
              {result.balanceChanges.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                    Balance Changes
                  </div>
                  <div className="space-y-1">
                    {result.balanceChanges.map((change, i) => {
                      const isNegative = change.delta.startsWith('-');
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700 rounded px-3 py-1.5"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-zinc-400 font-mono truncate">{change.address}</span>
                            <span className="text-[10px] text-zinc-500">{change.token}</span>
                          </div>
                          <span className={`text-xs font-mono font-medium shrink-0 ml-2 ${
                            isNegative ? 'text-red-400' : 'text-emerald-400'
                          }`}>
                            {isNegative ? change.delta : `+${change.delta}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Events (expandable) */}
              {result.events.length > 0 && (
                <div>
                  <button
                    onClick={() => setEventsExpanded(!eventsExpanded)}
                    className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {eventsExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    Events ({result.events.length})
                  </button>
                  {eventsExpanded && (
                    <div className="mt-1.5 space-y-1">
                      {result.events.map((evt, i) => (
                        <div key={i} className="bg-zinc-800/50 border border-zinc-700 rounded p-2">
                          <div className="text-[11px] text-emerald-400 font-mono truncate">{evt.type}</div>
                          {evt.payload && (
                            <pre className="text-[10px] text-zinc-400 mt-1 whitespace-pre-wrap break-all max-h-24 overflow-auto">
                              {typeof evt.payload === 'string' ? evt.payload : JSON.stringify(evt.payload, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && result && (
          <div className="px-4 py-3 border-t border-zinc-800 flex items-center justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                result.success
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white'
              }`}
            >
              {result.success ? 'Confirm & Send' : 'Send Anyway'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
