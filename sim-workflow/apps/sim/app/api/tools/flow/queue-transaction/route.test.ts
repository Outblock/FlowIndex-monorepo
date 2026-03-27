/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockQueueTransaction } = vi.hoisted(() => ({
  mockCheckInternalAuth: vi.fn(),
  mockQueueTransaction: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@/lib/approval/service', () => ({
  queueTransaction: mockQueueTransaction,
}))

import { POST } from './route'

describe('flow/queue-transaction route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckInternalAuth.mockResolvedValue({ success: true, userId: 'user-1' })
  })

  it('returns 401 when auth fails', async () => {
    mockCheckInternalAuth.mockResolvedValue({ success: false, error: 'unauthorized' })
    const req = createMockRequest('POST', { cadence: 'transaction {}' })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('unauthorized')
  })

  it('returns 400 when cadence is missing', async () => {
    const req = createMockRequest('POST', { network: 'mainnet' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('cadence is required')
  })

  it('queues transaction and returns result', async () => {
    const expiresAt = Date.now() + 900_000
    mockQueueTransaction.mockResolvedValue({
      pendingId: 'pending-1',
      approveUrl: 'https://studio.flowindex.io/approve/pending-1',
      rejectUrl: 'https://studio.flowindex.io/reject/pending-1',
      detailsUrl: 'https://studio.flowindex.io/details/pending-1',
      expiresAt,
    })

    const req = createMockRequest('POST', {
      cadence: 'transaction { execute {} }',
      network: 'testnet',
      signerAddress: '0x1234',
      mode: 'approve-only',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.output.pendingId).toBe('pending-1')
    expect(json.output.approveUrl).toContain('pending-1')
    expect(json.output.expiresAt).toBe(new Date(expiresAt).toISOString())

    expect(mockQueueTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'default',
        userId: 'user-1',
        cadence: 'transaction { execute {} }',
        network: 'testnet',
        signerAddress: '0x1234',
        mode: 'approve-only',
        arguments: '[]',
        expiresIn: 900,
      })
    )
  })

  it('passes signer config when signerPrivateKey provided', async () => {
    mockQueueTransaction.mockResolvedValue({
      pendingId: 'pending-2',
      approveUrl: 'https://example.com/approve',
      rejectUrl: 'https://example.com/reject',
      detailsUrl: 'https://example.com/details',
      expiresAt: Date.now() + 900_000,
    })

    const req = createMockRequest('POST', {
      cadence: 'transaction {}',
      signerPrivateKey: 'abc123',
      signerAddress: '0x5678',
      signerMode: 'hybrid-custody',
    })
    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(mockQueueTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        signerConfig: {
          signerMode: 'hybrid-custody',
          signerAddress: '0x5678',
          signerPrivateKey: 'abc123',
        },
      })
    )
  })
})
