/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockListPending } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockListPending: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@/lib/approval/service', () => ({
  listPending: mockListPending,
}))

import { POST } from './route'

describe('flow/list-pending route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true, userId: 'user-1' })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns empty list when no pending transactions', async () => {
    mockListPending.mockResolvedValue([])
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.output.transactions).toEqual([])
    expect(json.output.count).toBe(0)
    expect(mockListPending).toHaveBeenCalledWith('default', undefined)
  })

  it('returns transactions with mapped fields', async () => {
    const now = Date.now()
    mockListPending.mockResolvedValue([
      {
        id: 'pending-1',
        status: 'pending',
        mode: 'approve-only',
        network: 'mainnet',
        templateId: 'transfer_tokens_v3',
        signerAddress: '0x1234',
        createdAt: now,
        expiresAt: now + 900_000,
        cadence: 'transaction {}',
        arguments: '[]',
        workspaceId: 'ws-1',
        userId: 'user-1',
      },
    ])

    const req = createMockRequest('POST', { status: 'pending' })
    const res = await POST(req)
    const json = await res.json()

    expect(json.success).toBe(true)
    expect(json.output.count).toBe(1)
    expect(json.output.transactions[0]).toEqual({
      id: 'pending-1',
      status: 'pending',
      mode: 'approve-only',
      network: 'mainnet',
      templateId: 'transfer_tokens_v3',
      signerAddress: '0x1234',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 900_000).toISOString(),
    })
    expect(mockListPending).toHaveBeenCalledWith('default', 'pending')
  })
})
