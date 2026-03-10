import { defineEventHandler, readBody, createError } from 'h3'

const BACKEND_URL = process.env.SIMULATOR_BACKEND_URL || 'http://localhost:8080'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const resp = await fetch(`${BACKEND_URL}/flow/v1/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    throw createError({
      statusCode: resp.status,
      statusMessage: await resp.text(),
    })
  }

  const data = await resp.json()

  // Normalize snake_case → camelCase
  return {
    success: data.success,
    error: data.error,
    events: data.events ?? [],
    balanceChanges: data.balance_changes ?? data.balanceChanges ?? [],
    computationUsed: data.computation_used ?? data.computationUsed ?? 0,
  }
})
