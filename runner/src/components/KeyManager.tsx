import { useState } from 'react';
import { X, Plus, Download, Trash2, Key, Loader2 } from 'lucide-react';
import { useKeys, type UserKey } from '../auth/useKeys';

interface KeyManagerProps {
  onClose: () => void;
  network: 'mainnet' | 'testnet';
}

function truncateAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function SourceBadge({ source }: { source: UserKey['source'] }) {
  if (source === 'created') {
    return (
      <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded">
        created
      </span>
    );
  }
  return (
    <span className="bg-blue-500/10 text-blue-400 text-[10px] px-1.5 py-0.5 rounded">
      imported
    </span>
  );
}

export default function KeyManager({ onClose, network }: KeyManagerProps) {
  const { keys, loading, createKey, importKey, deleteKey } = useKeys();

  // Create form state
  const [createLabel, setCreateLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Import form state
  const [importPrivateKey, setImportPrivateKey] = useState('');
  const [importAddress, setImportAddress] = useState('');
  const [importLabel, setImportLabel] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    setCreateError('');
    setCreating(true);
    try {
      await createKey(createLabel || 'My Key', network);
      setCreateLabel('');
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setCreating(false);
    }
  };

  const handleImport = async () => {
    setImportError('');
    if (!importPrivateKey.trim()) {
      setImportError('Private key is required');
      return;
    }
    if (!importAddress.trim()) {
      setImportError('Flow address is required');
      return;
    }
    setImporting(true);
    try {
      await importKey(importPrivateKey.trim(), importAddress.trim(), importLabel || undefined);
      setImportPrivateKey('');
      setImportAddress('');
      setImportLabel('');
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Failed to import key');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await deleteKey(id);
      setConfirmDeleteId(null);
    } catch {
      // Key list will refresh anyway
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-700">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-700">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-100">My Keys</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 p-0.5"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Key list */}
        <div className="space-y-2">
          {loading && keys.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-zinc-500 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading keys...
            </div>
          ) : keys.length === 0 ? (
            <p className="text-zinc-500 text-xs text-center py-6">
              No keys yet. Create or import one below.
            </p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="bg-zinc-800 rounded px-2.5 py-2 border border-zinc-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      {key.label}
                    </span>
                    <SourceBadge source={key.source} />
                  </div>
                  {confirmDeleteId === key.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDelete(key.id)}
                        disabled={deleting}
                        className="text-red-400 hover:text-red-300 text-[10px] font-medium disabled:opacity-50"
                      >
                        {deleting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Confirm'
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-zinc-500 hover:text-zinc-300 text-[10px]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(key.id)}
                      className="text-zinc-500 hover:text-red-400 p-0.5"
                      title={`Delete key for ${truncateAddress(key.flow_address)}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-zinc-400 mt-1 font-mono">
                  {truncateAddress(key.flow_address)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-700" />

        {/* Create section */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Create New Address
          </h3>
          <input
            type="text"
            value={createLabel}
            onChange={(e) => setCreateLabel(e.target.value)}
            placeholder="My Key"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-2 py-1.5 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Create
          </button>
          {createError && (
            <p className="text-red-400 text-[11px]">{createError}</p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-700" />

        {/* Import section */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Import Existing Key
          </h3>
          <textarea
            value={importPrivateKey}
            onChange={(e) => setImportPrivateKey(e.target.value)}
            placeholder="Enter private key hex..."
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-2 py-1.5 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-none font-mono"
          />
          <input
            type="text"
            value={importAddress}
            onChange={(e) => setImportAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-2 py-1.5 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 font-mono"
          />
          <input
            type="text"
            value={importLabel}
            onChange={(e) => setImportLabel(e.target.value)}
            placeholder="Imported Key"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded px-2 py-1.5 text-xs placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
          />
          <button
            onClick={handleImport}
            disabled={importing}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {importing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Import
          </button>
          {importError && (
            <p className="text-red-400 text-[11px]">{importError}</p>
          )}
        </div>
      </div>
    </div>
  );
}
