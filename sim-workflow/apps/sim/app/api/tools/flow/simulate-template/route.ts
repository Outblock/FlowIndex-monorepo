import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { getTemplate } from '@flowindex/agent-wallet/templates'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/simulate-template')

const DEFAULT_SIMULATOR_URL = 'https://simulator.flowindex.io/api'
const DEFAULT_PAYER = 'e467b9dd11fa00df'

function normalizeAddress(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase()
}

/** Convert key-value args to JSON-CDC format using template arg schema */
function toJsonCdc(
  kvArgs: Record<string, string>,
  schema: Array<{ name: string; type: string }>
): Array<{ type: string; value: string }> {
  return schema.map((arg) => ({
    type: arg.type,
    value: kvArgs[arg.name] ?? '',
  }))
}

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { templateId, network, signerAddress } = body
    const argsStr = body.arguments ?? '{}'

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: 'templateId is required' },
        { status: 400 }
      )
    }

    if (network === 'testnet') {
      return NextResponse.json(
        { success: false, error: 'Simulation only supports mainnet (mainnet-fork emulator)' },
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

    let kvArgs: Record<string, string>
    try {
      kvArgs = JSON.parse(argsStr)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in arguments' },
        { status: 400 }
      )
    }

    const jsonCdcArgs = toJsonCdc(kvArgs, template.args)
    const simulatorUrl = process.env.FLOW_SIMULATOR_URL || DEFAULT_SIMULATOR_URL
    const authorizer = signerAddress ? normalizeAddress(signerAddress) : DEFAULT_PAYER

    const simulatorResponse = await fetch(`${simulatorUrl}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cadence: template.cadence,
        arguments: jsonCdcArgs,
        authorizers: [authorizer],
        payer: DEFAULT_PAYER,
      }),
    })

    const result = await simulatorResponse.json()

    const balanceChanges = (result.balance_changes ?? []).map(
      (bc: { address: string; token: string; delta: string }) => ({
        address: bc.address,
        token: bc.token,
        delta: bc.delta,
      })
    )

    const events = (result.events ?? []).map(
      (e: { type: string; payload: unknown }) => ({
        type: e.type,
        payload: e.payload,
      })
    )

    const summary = result.success
      ? `Template "${templateId}" simulation passed. ${events.length} events, ${result.computation_used} computation used.`
      : `Template "${templateId}" simulation failed: ${result.error}`

    return NextResponse.json({
      success: true,
      output: {
        content: summary,
        simulationSuccess: result.success,
        events,
        computationUsed: result.computation_used ?? 0,
        balanceChanges,
        error: result.success ? undefined : result.error,
      },
    })
  } catch (error) {
    logger.error('Template simulation failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
