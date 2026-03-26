/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockListTemplates } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockListTemplates: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@flowindex/agent-wallet/templates', () => ({
  listTemplates: mockListTemplates,
}))

import { POST } from './route'

describe('flow/list-templates route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns all templates when no category specified', async () => {
    mockListTemplates.mockReturnValue([
      { name: 'transfer_tokens_v3', category: 'token', type: 'transaction', description: 'Transfer tokens' },
      { name: 'create_coa', category: 'evm', type: 'transaction', description: 'Create COA' },
    ])
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.output.templates).toHaveLength(2)
    expect(mockListTemplates).toHaveBeenCalledWith(undefined)
  })

  it('filters by category', async () => {
    mockListTemplates.mockReturnValue([
      { name: 'transfer_tokens_v3', category: 'token', type: 'transaction', description: 'Transfer tokens' },
    ])
    const req = createMockRequest('POST', { category: 'token' })
    const res = await POST(req)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.output.templates).toHaveLength(1)
    expect(mockListTemplates).toHaveBeenCalledWith('token')
  })
})
