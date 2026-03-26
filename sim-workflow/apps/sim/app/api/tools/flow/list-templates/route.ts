import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { listTemplates } from '@flowindex/agent-wallet/templates'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/list-templates')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const category = body.category as string | undefined

    const templates = listTemplates(category).map((t) => ({
      name: t.name,
      category: t.category,
      type: t.type,
      description: t.description,
    }))

    const content = `Found ${templates.length} templates${category ? ` in category "${category}"` : ''}`

    return NextResponse.json({
      success: true,
      output: { content, templates },
    })
  } catch (error) {
    logger.error('Failed to list templates', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
