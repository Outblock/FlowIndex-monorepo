import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Copy, Check, Key, Loader2, AlertTriangle, Wallet, ExternalLink, User } from 'lucide-react'
import DeveloperLayout from '../../components/developer/DeveloperLayout'
import {
  listWalletKeys,
  createWalletKey,
  deleteWalletKey,
  getWalletInfo,
} from '../../lib/webhookApi'
import type { WalletAPIKey, WalletInfo } from '../../lib/webhookApi'

export const Route = createFileRoute('/developer/wallet')({
  component: DeveloperWallet,
})

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never'
  const d = new Date(dateStr)
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 0) return 'Just now'
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

function maskKey(prefix: string | undefined): string {
  if (!prefix) return '••••••••••••••••••••'
  return prefix + '••••••••••••••••'
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function DeveloperWallet() {
  // --- Wallet API Keys ---
  const [keys, setKeys] = useState<WalletAPIKey[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<WalletAPIKey | null>(null)
  const [deleting, setDeleting] = useState(false)

  // --- Wallet Info ---
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null)
  const [walletLoading, setWalletLoading] = useState(true)

  const fetchKeys = useCallback(async () => {
    try {
      setError(null)
      const data = await listWalletKeys()
      setKeys(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet keys')
    } finally {
      setKeysLoading(false)
    }
  }, [])

  const fetchWalletInfo = useCallback(async () => {
    try {
      const data = await getWalletInfo()
      setWalletInfo(data)
    } catch {
      // Non-critical — wallet info may not be available yet
    } finally {
      setWalletLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
    fetchWalletInfo()
  }, [fetchKeys, fetchWalletInfo])

  async function handleCreate() {
    if (!createName.trim()) return
    setCreating(true)
    try {
      const newKey = await createWalletKey(createName.trim())
      setCreatedKey(newKey.key ?? null)
      setKeys((prev) => [newKey, ...prev])
      setCreateName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet key')
      setShowCreateModal(false)
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteWalletKey(deleteTarget.id)
      setKeys((prev) => prev.filter((k) => k.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete wallet key')
    } finally {
      setDeleting(false)
    }
  }

  function handleCopy() {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function closeCreateModal() {
    setShowCreateModal(false)
    setCreateName('')
    setCreatedKey(null)
    setCopied(false)
  }

  const allAccounts = [
    ...(walletInfo?.accounts ?? []).map((a) => ({
      address: a.flow_address,
      label: a.name || 'Passkey Account',
      source: 'passkey' as const,
      created: a.created_at,
    })),
    ...(walletInfo?.keys ?? []).map((k) => ({
      address: k.flow_address,
      label: k.label || `Key #${k.key_index}`,
      source: k.source as string,
      created: k.created_at,
    })),
  ]

  // Deduplicate by address
  const uniqueAccounts = allAccounts.filter(
    (a, i, arr) => arr.findIndex((b) => b.address === a.address) === i,
  )

  return (
    <DeveloperLayout>
      <div className="flex-1 overflow-y-auto max-w-4xl mx-auto w-full space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Wallet</h1>
            <p className="text-xs md:text-sm text-neutral-400 mt-1">
              Manage wallet API keys for agent MCP access and view linked accounts
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 md:px-4 py-2 bg-[#00ef8b] text-black font-medium text-sm hover:bg-[#00ef8b]/90 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Key</span>
            <span className="sm:hidden">Create</span>
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-0 truncate">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400/60 hover:text-red-400 transition-colors shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Wallet API Keys */}
        <div>
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
            Wallet API Keys
          </h2>
          <div className="bg-neutral-900 border border-neutral-800 overflow-hidden">
            {keysLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
              </div>
            ) : keys.length === 0 ? (
              <div className="text-center py-16 text-neutral-500">
                <Key className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No wallet API keys yet. Create one to get started.</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-neutral-800">
                  {keys.map((wk) => (
                    <motion.div
                      key={wk.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-white truncate">{wk.name}</span>
                        <button
                          onClick={() => setDeleteTarget(wk)}
                          className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                          title="Delete key"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 bg-neutral-800">
                        <code className="flex-1 text-xs font-mono text-neutral-400 truncate select-all">
                          {maskKey(wk.key_prefix)}
                        </code>
                      </div>
                      <div className="flex items-center justify-between text-xs text-neutral-500">
                        <span>Created {new Date(wk.created_at).toLocaleDateString()}</span>
                        <span>Last used: {timeAgo(wk.last_used)}</span>
                      </div>
                      {wk.scopes && wk.scopes.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {wk.scopes.map((s) => (
                            <span
                              key={s}
                              className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 font-mono"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Desktop table */}
                <table className="w-full hidden md:table">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left">
                      <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Key
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Scopes
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Last Used
                      </th>
                      <th className="px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {keys.map((wk) => (
                      <motion.tr
                        key={wk.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-neutral-800/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-white">{wk.name}</td>
                        <td className="px-4 py-3">
                          <code className="text-sm font-mono text-neutral-400">
                            {maskKey(wk.key_prefix)}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(wk.scopes ?? []).map((s) => (
                              <span
                                key={s}
                                className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-400 font-mono"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-400">
                          {new Date(wk.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-400">
                          {timeAgo(wk.last_used)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setDeleteTarget(wk)}
                            className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete key"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
          {keys.length > 0 && (
            <p className="text-xs text-neutral-500 mt-2">
              Use this key as <code className="text-neutral-400 font-mono">FLOWINDEX_TOKEN</code> in
              your agent-wallet MCP config. Full keys are only shown once at creation.
            </p>
          )}
        </div>

        {/* Linked Accounts */}
        <div>
          <h2 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
            Linked Accounts
          </h2>
          <div className="bg-neutral-900 border border-neutral-800 overflow-hidden">
            {walletLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
              </div>
            ) : uniqueAccounts.length === 0 ? (
              <div className="text-center py-12 text-neutral-500">
                <User className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No linked Flow accounts yet.</p>
                <p className="text-xs text-neutral-600 mt-1">
                  Set up accounts in the wallet app Settings.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {uniqueAccounts.map((acct) => (
                  <div
                    key={acct.address}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/30 transition-colors"
                  >
                    <Wallet className="w-4 h-4 text-neutral-500 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-white">
                          {shortenAddress(acct.address)}
                        </code>
                        <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 text-neutral-500 font-mono">
                          {acct.source}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-0.5">{acct.label}</p>
                    </div>
                    <a
                      href={`/account/${acct.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-neutral-500 hover:text-white transition-colors shrink-0"
                      title="View on explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-2">
            For full account management, visit the{' '}
            <a
              href="https://wallet.flowindex.io/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00ef8b] hover:underline"
            >
              wallet app Settings
            </a>
            .
          </p>
        </div>
      </div>

      {/* Create Key Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget && !createdKey) closeCreateModal()
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-md mx-0 sm:mx-4 p-6"
            >
              {createdKey ? (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white">Wallet Key Created</h2>
                  <p className="text-sm text-neutral-400">
                    Copy this key now. You will not be able to see it again.
                  </p>
                  <div className="flex items-center gap-2 p-3 bg-neutral-800 border border-neutral-700">
                    <code className="flex-1 text-xs sm:text-sm font-mono text-[#00ef8b] break-all select-all">
                      {createdKey}
                    </code>
                    <button
                      onClick={handleCopy}
                      className="shrink-0 p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                      title="Copy to clipboard"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-[#00ef8b]" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Set this as{' '}
                    <code className="text-neutral-400 font-mono">FLOWINDEX_TOKEN</code> in your
                    agent-wallet MCP configuration.
                  </p>
                  <button
                    onClick={closeCreateModal}
                    className="w-full py-2 bg-neutral-800 text-white text-sm font-medium hover:bg-neutral-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-white">Create Wallet Key</h2>
                  <div>
                    <label
                      htmlFor="wallet-key-name"
                      className="block text-sm text-neutral-400 mb-1.5"
                    >
                      Key Name
                    </label>
                    <input
                      id="wallet-key-name"
                      type="text"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreate()
                      }}
                      placeholder="e.g. Claude Agent, Production Bot"
                      className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[#00ef8b]/50 focus:ring-1 focus:ring-[#00ef8b]/25 transition-colors"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={closeCreateModal}
                      className="flex-1 py-2 bg-neutral-800 text-neutral-300 text-sm font-medium hover:bg-neutral-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={!createName.trim() || creating}
                      className="flex-1 py-2 bg-[#00ef8b] text-black text-sm font-medium hover:bg-[#00ef8b]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDeleteTarget(null)
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-neutral-900 border border-neutral-800 w-full max-w-sm mx-0 sm:mx-4 p-6 space-y-4"
            >
              <h2 className="text-lg font-semibold text-white">Delete Wallet Key</h2>
              <p className="text-sm text-neutral-400">
                Are you sure you want to delete{' '}
                <span className="text-white font-medium">{deleteTarget.name}</span>? Any agents
                using this key will lose access.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 py-2 bg-neutral-800 text-neutral-300 text-sm font-medium hover:bg-neutral-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DeveloperLayout>
  )
}
