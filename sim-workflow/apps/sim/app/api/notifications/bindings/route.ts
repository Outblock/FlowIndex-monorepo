import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { checkInternalAuth } from '@/lib/auth/hybrid'

const logger = createLogger('notifications/bindings')

export async function GET(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const workspaceId = request.headers.get('x-workspace-id') || 'default'
    const { db } = await import('@sim/db')

    const rows = await db.execute(sql`
      SELECT id, user_id, workspace_id, channel, channel_user_id, created_at
      FROM notification_bindings
      WHERE user_id = ${auth.userId!} AND workspace_id = ${workspaceId}
      ORDER BY created_at DESC
    `)

    return NextResponse.json({ success: true, bindings: rows.rows })
  } catch (error) {
    logger.error('Failed to list notification bindings', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { bindingId } = body

    if (!bindingId) {
      return NextResponse.json(
        { success: false, error: 'bindingId is required' },
        { status: 400 }
      )
    }

    const { db } = await import('@sim/db')

    const result = await db.execute(sql`
      DELETE FROM notification_bindings
      WHERE id = ${bindingId} AND user_id = ${auth.userId!}
      RETURNING id
    `)

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Binding not found or not owned by user' },
        { status: 404 }
      )
    }

    logger.info('Notification binding deleted', { bindingId, userId: auth.userId })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('Failed to delete notification binding', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
