/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { POST } from './route'

describe('flow/simulate-transaction route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', { cadence: 'transaction() {}' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when cadence is missing', async () => {
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for testnet', async () => {
    const req = createMockRequest('POST', {
      cadence: 'transaction() { execute {} }',
      network: 'testnet',
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain('mainnet')
  })

  it('calls simulator API and returns results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        events: [{ type: 'A.1654653399040a61.FlowToken.TokensWithdrawn', payload: {} }],
        computation_used: 145,
        balance_changes: [{ address: 'f8d6e0586b0a20c7', token: 'FlowToken', delta: '-10.0' }],
      }),
    })

    const req = createMockRequest('POST', {
      cadence: 'transaction() { execute {} }',
      arguments: '[]',
      signerAddress: 'f8d6e0586b0a20c7',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.simulationSuccess).toBe(true)
    expect(json.output.events).toHaveLength(1)
    expect(json.output.computationUsed).toBe(145)
    expect(json.output.balanceChanges).toHaveLength(1)

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/simulate'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('handles simulator error response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        error: 'cadence execution error',
        computation_used: 0,
        events: [],
        balance_changes: [],
      }),
    })

    const req = createMockRequest('POST', {
      cadence: 'transaction() { execute { panic("fail") } }',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.simulationSuccess).toBe(false)
    expect(json.output.error).toContain('cadence execution error')
  })
})
