import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { createLogger } from '@sim/logger'

const logger = createLogger('flow/simulate-transaction')

const DEFAULT_SIMULATOR_URL = 'https://simulator.flowindex.io/api'
const DEFAULT_PAYER = 'e467b9dd11fa00df' // Emulator service account

function normalizeAddress(addr: string): string {
  return addr.replace(/^0x/, '').toLowerCase()
}

export async function POST(request: NextRequest) {
  const auth = await checkInternalAuth(request)
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { cadence, network, signerAddress } = body
    const args = body.arguments ?? '[]'

    if (!cadence) {
      return NextResponse.json(
        { success: false, error: 'cadence is required' },
        { status: 400 }
      )
    }

    if (network === 'testnet') {
      return NextResponse.json(
        { success: false, error: 'Simulation only supports mainnet (mainnet-fork emulator)' },
        { status: 400 }
      )
    }

    const simulatorUrl = process.env.FLOW_SIMULATOR_URL || DEFAULT_SIMULATOR_URL
    const authorizer = signerAddress ? normalizeAddress(signerAddress) : DEFAULT_PAYER

    let parsedArgs: unknown[]
    try {
      parsedArgs = JSON.parse(args)
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in arguments' },
        { status: 400 }
      )
    }

    // Coerce Bool string values to native JSON booleans for JSON-Cadence encoding
    parsedArgs = parsedArgs.map((arg: unknown) => {
      if (arg && typeof arg === 'object' && 'type' in arg && 'value' in arg) {
        const typed = arg as { type: string; value: unknown }
        if (typed.type === 'Bool' && typeof typed.value === 'string') {
          return { ...typed, value: typed.value === 'true' }
        }
      }
      return arg
    })

    const simulatorResponse = await fetch(`${simulatorUrl}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cadence,
        arguments: parsedArgs,
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
      ? `Simulation passed. ${events.length} events, ${result.computation_used} computation used.`
      : `Simulation failed: ${result.error}`

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
    logger.error('Simulation request failed', { error })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
