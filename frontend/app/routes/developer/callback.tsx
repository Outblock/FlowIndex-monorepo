import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

export const Route = createFileRoute('/developer/callback')({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = typeof search.redirect === 'string' ? search.redirect : undefined
    return { redirect }
  },
  component: DeveloperCallbackPage,
})

function DeveloperCallbackPage() {
  const { handleCallback } = useAuth()
  const { redirect } = Route.useSearch()
  const processed = useRef(false)
  const redirectTo = redirect && redirect.startsWith('/') ? redirect : '/developer'

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const hash = window.location.hash
    if (hash) {
      handleCallback(hash)
    }

    // Navigate after processing.
    window.location.assign(redirectTo)
  }, [handleCallback, redirectTo])

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#00ef8b] mx-auto mb-4" />
        <p className="text-neutral-400 text-sm">Signing you in...</p>
      </div>
    </div>
  )
}
