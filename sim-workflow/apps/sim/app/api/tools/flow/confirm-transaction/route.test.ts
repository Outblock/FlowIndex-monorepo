/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockApproveTransaction } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockApproveTransaction: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@/lib/approval/service', () => ({
  approveTransaction: mockApproveTransaction,
}))

import { POST } from './route'

describe('flow/confirm-transaction route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true, userId: 'user-1' })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', { pendingId: 'pending-1' })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns 400 when pendingId is missing', async () => {
    const req = createMockRequest('POST', {})
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('pendingId is required')
  })

  it('approves transaction and returns result', async () => {
    mockApproveTransaction.mockResolvedValue({
      success: true,
      status: 'approved',
    })

    const req = createMockRequest('POST', { pendingId: 'pending-1' })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.output.status).toBe('approved')
    expect(json.output.content).toContain('approved')

    expect(mockApproveTransaction).toHaveBeenCalledWith('default', 'pending-1', 'user-1', false)
  })

  it('passes execute flag to approveTransaction', async () => {
    mockApproveTransaction.mockResolvedValue({
      success: true,
      status: 'executed',
      txId: 'tx-abc',
    })

    const req = createMockRequest('POST', { pendingId: 'pending-1', execute: true })
    const res = await POST(req)
    const json = await res.json()

    expect(json.output.txId).toBe('tx-abc')
    expect(json.output.content).toContain('executed')
    expect(mockApproveTransaction).toHaveBeenCalledWith('default', 'pending-1', 'user-1', true)
  })
})
