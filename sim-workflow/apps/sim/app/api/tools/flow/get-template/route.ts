import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { getTemplate } from '@flowindex/agent-wallet/templates'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/get-template')

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const templateId = body.templateId as string

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'templateId is required' },
        { status: 400 }
      )
    }

    const template = getTemplate(templateId)
    if (!template) {
      return NextResponse.json(
        { success: false, error: `Template "${templateId}" not found` },
        { status: 404 }
      )
    }

    const argsDesc = template.args.length > 0
      ? template.args.map((a) => `${a.name}: ${a.type}`).join(', ')
      : 'none'
    const content = `${template.description}\nArguments: ${argsDesc}`

    return NextResponse.json({
      success: true,
      output: {
        content,
        template: {
          name: template.name,
          category: template.category,
          type: template.type,
          description: template.description,
          cadence: template.cadence,
          arguments: template.args,
        },
      },
    })
  } catch (error) {
    logger.error('Failed to get template', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
