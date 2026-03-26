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

import { POST } from './route'

describe('flow/get-template route', () => {
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

  it('returns full template with cadence source and args', async () => {
    mockGetTemplate.mockReturnValue({
      name: 'transfer_tokens_v3',
      category: 'token',
      type: 'transaction',
      description: 'Transfer fungible tokens',
      cadence: 'transaction(amount: UFix64, to: Address) { ... }',
      args: [
        { name: 'amount', type: 'UFix64', description: 'Amount to transfer' },
        { name: 'to', type: 'Address', description: 'Recipient address' },
      ],
    })
    const req = createMockRequest('POST', { templateId: 'transfer_tokens_v3' })
    const res = await POST(req)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.output.template.name).toBe('transfer_tokens_v3')
    expect(json.output.template.cadence).toContain('transaction')
    expect(json.output.template.arguments).toHaveLength(2)
    expect(json.output.content).toContain('amount: UFix64')
  })
})
