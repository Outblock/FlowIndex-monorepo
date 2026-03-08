import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Loader2, AlertTriangle, Bot } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { completeAgentLogin } from '../../lib/webhookApi'

export const Route = createFileRoute('/agent/auth')({
  validateSearch: (search: Record<string, unknown>): { session?: string } => {
    const session = typeof search.session === 'string' ? search.session : undefined
    return { session }
  },
  component: AgentAuthPage,
})

function AgentAuthPage() {
  const { user, loading: authLoading } = useAuth()
  const { session: sessionId } = Route.useSearch()

  const [status, setStatus] = useState<'loading' | 'completing' | 'success' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  // If not authenticated, redirect to login with redirect back here
  useEffect(() => {
    if (authLoading) return

    if (!user) {
      const currentUrl =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : `/agent/auth?session=${sessionId ?? ''}`
      window.location.assign(
        `/developer/login?redirect=${encodeURIComponent(currentUrl)}`,
      )
      return
    }

    // User is authenticated — complete the agent login
    if (!sessionId) {
      setStatus('error')
      setError('Missing session parameter. Please try the agent login flow again.')
      return
    }

    setStatus('completing')
    completeAgentLogin(sessionId)
      .then(() => {
        setStatus('success')
      })
      .catch((err) => {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to complete agent authentication')
      })
  }, [authLoading, user, sessionId])

  if (authLoading || status === 'loading') {
    return (
      <div className="flex-1 flex items-center justify-center bg-black min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
      </div>
    )
  }

  if (status === 'completing') {
    return (
      <div className="flex-1 flex items-center justify-center bg-black min-h-screen p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <div className="border border-neutral-800 bg-neutral-900 p-8">
            <Loader2 className="w-8 h-8 animate-spin text-[#00ef8b] mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-white mb-2">Connecting Agent</h1>
            <p className="text-sm text-neutral-400">Completing authentication...</p>
          </div>
        </motion.div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center bg-black min-h-screen p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center"
        >
          <div className="border border-red-500/20 bg-neutral-900 p-8">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-4" />
            <h1 className="text-lg font-semibold text-white mb-2">Authentication Failed</h1>
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.close()}
              className="px-4 py-2 bg-neutral-800 text-neutral-300 text-sm font-medium hover:bg-neutral-700 transition-colors"
            >
              Close Window
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // Success
  return (
    <div className="flex-1 flex items-center justify-center bg-black min-h-screen p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', bounce: 0.3 }}
        className="w-full max-w-sm text-center"
      >
        <div className="border border-[#00ef8b]/20 bg-neutral-900 p-8">
          <div className="relative mx-auto w-12 h-12 mb-4">
            <CheckCircle2 className="w-12 h-12 text-[#00ef8b]" />
            <Bot className="w-5 h-5 text-[#00ef8b] absolute -bottom-1 -right-1 bg-neutral-900 rounded-full p-0.5" />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">Connected!</h1>
          <p className="text-sm text-neutral-400 mb-6">
            Your agent has been authenticated. You can close this window and return to your terminal.
          </p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-[#00ef8b] text-black text-sm font-medium hover:bg-[#00ef8b]/90 transition-colors"
          >
            Close Window
          </button>
        </div>
      </motion.div>
    </div>
  )
}
