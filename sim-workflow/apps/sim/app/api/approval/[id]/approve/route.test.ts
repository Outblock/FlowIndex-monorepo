/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockValidateToken, mockGetTransactionById, mockApproveTransaction } = vi.hoisted(() => ({
  mockValidateToken: vi.fn(),
  mockGetTransactionById: vi.fn(),
  mockApproveTransaction: vi.fn(),
}))

vi.mock('@/lib/approval/token', () => ({
  validateToken: mockValidateToken,
}))

vi.mock('@/lib/approval/service', () => ({
  getTransactionById: mockGetTransactionById,
  approveTransaction: mockApproveTransaction,
}))

import { POST } from '@/app/api/approval/[id]/approve/route'

const BASE = 'http://localhost:3000'

const PENDING_TX = {
  id: 'test-pending-id',
  workspaceId: 'ws-1',
  userId: 'user-1',
  mode: 'approve-only' as const,
  cadence: 'transaction {}',
  arguments: '[]',
  network: 'testnet' as const,
  callbackBaseUrl: 'https://example.com',
  status: 'pending' as const,
  createdAt: Date.now() - 60_000,
  expiresAt: Date.now() + 600_000,
}

describe('POST /api/approval/[id]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when token is missing', async () => {
    const req = createMockRequest(
      'POST',
      undefined,
      {},
      `${BASE}/api/approval/test-id/approve`
    )
    const res = await POST(req as any, { params: Promise.resolve({ id: 'test-id' }) })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'Token required' })
  })

  it('returns 404 when transaction is not found', async () => {
    mockGetTransactionById.mockResolvedValue(null)

    const req = createMockRequest(
      'POST',
      undefined,
      {},
      `${BASE}/api/approval/test-id/approve?token=abc123`
    )
    const res = await POST(req as any, { params: Promise.resolve({ id: 'test-id' }) })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'Transaction not found' })
  })

  it('returns 401 when token is invalid', async () => {
    mockGetTransactionById.mockResolvedValue(PENDING_TX)
    mockValidateToken.mockReturnValue(false)

    const req = createMockRequest(
      'POST',
      undefined,
      {},
      `${BASE}/api/approval/test-pending-id/approve?token=bad-token`
    )
    const res = await POST(req as any, { params: Promise.resolve({ id: 'test-pending-id' }) })

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'Invalid token' })
    expect(mockValidateToken).toHaveBeenCalledWith(
      'bad-token',
      'test-pending-id',
      'approve',
      PENDING_TX.expiresAt
    )
  })

  it('returns 410 when transaction is expired', async () => {
    const expiredTx = { ...PENDING_TX, expiresAt: Date.now() - 1000 }
    mockGetTransactionById.mockResolvedValue(expiredTx)
    mockValidateToken.mockReturnValue(true)

    const req = createMockRequest(
      'POST',
      undefined,
      {},
      `${BASE}/api/approval/test-pending-id/approve?token=valid`
    )
    const res = await POST(req as any, { params: Promise.resolve({ id: 'test-pending-id' }) })

    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'Transaction expired' })
  })

  it('returns 409 when transaction is already resolved', async () => {
    const approvedTx = { ...PENDING_TX, status: 'approved' as const }
    mockGetTransactionById.mockResolvedValue(approvedTx)
    mockValidateToken.mockReturnValue(true)

    const req = createMockRequest(
      'POST',
      undefined,
      {},
      `${BASE}/api/approval/test-pending-id/approve?token=valid`
    )
    const res = await POST(req as any, { params: Promise.resolve({ id: 'test-pending-id' }) })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'Transaction already approved' })
  })

  it('returns 200 with result on successful approve', async () => {
    mockGetTransactionById.mockResolvedValue(PENDING_TX)
    mockValidateToken.mockReturnValue(true)
    mockApproveTransaction.mockResolvedValue({ success: true, status: 'approved' })

    const req = createMockRequest(
      'POST',
      undefined,
      {},
      `${BASE}/api/approval/test-pending-id/approve?token=valid`
    )
    const res = await POST(req as any, { params: Promise.resolve({ id: 'test-pending-id' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, status: 'approved' })
    expect(mockApproveTransaction).toHaveBeenCalledWith('ws-1', 'test-pending-id', 'external', true)
  })

  it('returns 500 on unexpected error', async () => {
    mockGetTransactionById.mockRejectedValue(new Error('DB connection failed'))

    const req = createMockRequest(
      'POST',
      undefined,
      {},
      `${BASE}/api/approval/test-pending-id/approve?token=valid`
    )
    const res = await POST(req as any, { params: Promise.resolve({ id: 'test-pending-id' }) })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'DB connection failed' })
  })
})
