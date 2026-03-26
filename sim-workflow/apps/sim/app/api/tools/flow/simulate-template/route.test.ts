/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockGetTemplate } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockGetTemplate: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@flowindex/agent-wallet/templates', () => ({
  getTemplate: mockGetTemplate,
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { POST } from './route'

describe('flow/simulate-template route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', { templateId: 'transfer_tokens_v3' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when templateId is missing', async () => {
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when template not found', async () => {
    mockGetTemplate.mockReturnValue(undefined)
    const req = createMockRequest('POST', { templateId: 'nonexistent' })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 400 for testnet', async () => {
    mockGetTemplate.mockReturnValue({
      name: 'transfer_tokens_v3',
      category: 'token',
      type: 'transaction',
      description: 'Transfer tokens',
      cadence: 'transaction(amount: UFix64, to: Address) { ... }',
      args: [
        { name: 'amount', type: 'UFix64', description: 'Amount to transfer' },
        { name: 'to', type: 'Address', description: 'Recipient address' },
      ],
    })
    const req = createMockRequest('POST', {
      templateId: 'transfer_tokens_v3',
      network: 'testnet',
    })
    const res = await POST(req)
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain('mainnet')
  })

  it('converts key-value args to JSON-CDC and calls simulator', async () => {
    mockGetTemplate.mockReturnValue({
      name: 'transfer_tokens_v3',
      category: 'token',
      type: 'transaction',
      description: 'Transfer tokens',
      cadence: 'transaction(amount: UFix64, to: Address) { ... }',
      args: [
        { name: 'amount', type: 'UFix64', description: 'Amount to transfer' },
        { name: 'to', type: 'Address', description: 'Recipient address' },
      ],
    })

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        events: [],
        computation_used: 100,
        balance_changes: [],
      }),
    })

    const req = createMockRequest('POST', {
      templateId: 'transfer_tokens_v3',
      arguments: '{"amount": "100.0", "to": "0xabcdef1234567890"}',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.simulationSuccess).toBe(true)

    const fetchCall = mockFetch.mock.calls[0]
    const fetchBody = JSON.parse(fetchCall[1].body)
    expect(fetchBody.arguments).toEqual([
      { type: 'UFix64', value: '100.0' },
      { type: 'Address', value: '0xabcdef1234567890' },
    ])
  })

  it('handles simulator error response', async () => {
    mockGetTemplate.mockReturnValue({
      name: 'transfer_tokens_v3',
      category: 'token',
      type: 'transaction',
      description: 'Transfer tokens',
      cadence: 'transaction(amount: UFix64, to: Address) { ... }',
      args: [],
    })

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
      templateId: 'transfer_tokens_v3',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.simulationSuccess).toBe(false)
    expect(json.output.error).toContain('cadence execution error')
    expect(json.output.content).toContain('transfer_tokens_v3')
  })
})
