/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingTransaction } from '@/lib/approval/types'

const { mockStore, mockBuildCallbackUrls, mockEncryptSecret, mockDecryptSecret, mockResolveSignerFromParams, mockFclMutate, mockFclTx, mockFclConfig } = vi.hoisted(() => {
  const mockStore = {
    create: vi.fn(),
    get: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  }
  return {
    mockStore,
    mockBuildCallbackUrls: vi.fn(),
    mockEncryptSecret: vi.fn(),
    mockDecryptSecret: vi.fn(),
    mockResolveSignerFromParams: vi.fn(),
    mockFclMutate: vi.fn(),
    mockFclTx: vi.fn(),
    mockFclConfig: vi.fn(() => ({ put: vi.fn() })),
  }
})

vi.mock('@/lib/approval/store', () => ({
  getApprovalStore: () => mockStore,
}))

vi.mock('@/lib/approval/token', () => ({
  buildCallbackUrls: mockBuildCallbackUrls,
}))

vi.mock('@/lib/core/security/encryption', () => ({
  encryptSecret: mockEncryptSecret,
  decryptSecret: mockDecryptSecret,
}))

vi.mock('@/lib/flow/signer-resolver', () => ({
  resolveSignerFromParams: mockResolveSignerFromParams,
}))

vi.mock('@onflow/fcl', () => ({
  config: mockFclConfig,
  mutate: mockFclMutate,
  tx: mockFclTx,
}))

import {
  queueTransaction,
  approveTransaction,
  rejectTransaction,
  listPending,
  getTransaction,
  getTransactionById,
} from './service'

function makeTx(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
  return {
    id: 'pending-123',
    workspaceId: 'ws-1',
    userId: 'user-1',
    mode: 'approve-only',
    cadence: 'transaction() { execute {} }',
    arguments: '[]',
    network: 'mainnet',
    callbackBaseUrl: 'https://studio.flowindex.io',
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 900_000,
    ...overrides,
  }
}

describe('approval/service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    mockBuildCallbackUrls.mockReturnValue({
      approveUrl: 'https://studio.flowindex.io/api/approval/pending-123/approve?token=abc',
      rejectUrl: 'https://studio.flowindex.io/api/approval/pending-123/reject?token=def',
      detailsUrl: 'https://studio.flowindex.io/api/approval/pending-123?token=ghi',
    })
  })

  describe('queueTransaction', () => {
    it('creates a pending transaction and returns URLs', async () => {
      const result = await queueTransaction({
        workspaceId: 'ws-1',
        userId: 'user-1',
        mode: 'approve-only',
        cadence: 'transaction() {}',
        arguments: '[]',
        network: 'mainnet',
      })

      expect(result.pendingId).toBeDefined()
      expect(result.approveUrl).toContain('/approve')
      expect(result.rejectUrl).toContain('/reject')
      expect(result.detailsUrl).toContain('token=')
      expect(result.expiresAt).toBeGreaterThan(Date.now())
      expect(mockStore.create).toHaveBeenCalledOnce()

      const created = mockStore.create.mock.calls[0][0] as PendingTransaction
      expect(created.status).toBe('pending')
      expect(created.workspaceId).toBe('ws-1')
    })

    it('sends webhook POST when webhookUrl is provided', async () => {
      await queueTransaction({
        workspaceId: 'ws-1',
        userId: 'user-1',
        mode: 'approve-only',
        cadence: 'transaction() {}',
        arguments: '[]',
        network: 'mainnet',
        webhookUrl: 'https://hooks.example.com/notify',
      })

      // Fire-and-forget, wait a tick
      await new Promise((r) => setTimeout(r, 1))

      expect(fetch).toHaveBeenCalledWith(
        'https://hooks.example.com/notify',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )

      const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(body.type).toBe('approval_requested')
      expect(body.actions.approve).toBeDefined()
    })

    it('encrypts signerConfig when provided', async () => {
      mockEncryptSecret.mockResolvedValue({ encrypted: 'encrypted-data', iv: 'iv-hex' })

      await queueTransaction({
        workspaceId: 'ws-1',
        userId: 'user-1',
        mode: 'approve-only',
        cadence: 'transaction() {}',
        arguments: '[]',
        network: 'mainnet',
        signerConfig: {
          signerMode: 'legacy',
          signerAddress: '0x1234',
          signerPrivateKey: 'deadbeef',
        },
      })

      expect(mockEncryptSecret).toHaveBeenCalledOnce()
      const created = mockStore.create.mock.calls[0][0] as PendingTransaction
      expect(created.encryptedSignerConfig).toBe('encrypted-data')
    })
  })

  describe('approveTransaction', () => {
    it('marks approved and executes with mocked FCL', async () => {
      const tx = makeTx({
        encryptedSignerConfig: 'encrypted-config',
        webhookUrl: 'https://hooks.example.com/notify',
      })
      mockStore.get.mockResolvedValue(tx)

      const mockAuthz = vi.fn()
      mockDecryptSecret.mockResolvedValue({
        decrypted: JSON.stringify({
          signerMode: 'legacy',
          signerAddress: '0x1234',
          signerPrivateKey: 'deadbeef',
        }),
      })
      mockResolveSignerFromParams.mockResolvedValue({ signer: {}, authz: mockAuthz })
      mockFclConfig.mockReturnValue({ put: vi.fn() })
      mockFclMutate.mockResolvedValue('tx-id-abc')
      mockFclTx.mockReturnValue({ onceSealed: vi.fn().mockResolvedValue({}) })

      const result = await approveTransaction('ws-1', 'pending-123', 'admin@test.com', true)

      expect(result.success).toBe(true)
      expect(result.status).toBe('executed')
      expect(result.txId).toBe('tx-id-abc')
      expect(mockDecryptSecret).toHaveBeenCalledWith('encrypted-config')
      expect(mockFclMutate).toHaveBeenCalledOnce()
      expect(mockStore.update).toHaveBeenCalledWith('ws-1', 'pending-123', expect.objectContaining({ status: 'executed', txId: 'tx-id-abc' }))
    })

    it('rejects expired transaction', async () => {
      const tx = makeTx({ expiresAt: Date.now() - 1000 })
      mockStore.get.mockResolvedValue(tx)

      const result = await approveTransaction('ws-1', 'pending-123', 'admin@test.com')

      expect(result.success).toBe(false)
      expect(result.status).toBe('expired')
      expect(mockStore.update).toHaveBeenCalledWith('ws-1', 'pending-123', { status: 'expired' })
    })

    it('rejects already-resolved transaction', async () => {
      const tx = makeTx({ status: 'approved' })
      mockStore.get.mockResolvedValue(tx)

      const result = await approveTransaction('ws-1', 'pending-123', 'admin@test.com')

      expect(result.success).toBe(false)
      expect(result.status).toBe('approved')
      expect(result.error).toContain('already approved')
    })

    it('returns not found when transaction does not exist', async () => {
      mockStore.get.mockResolvedValue(null)

      const result = await approveTransaction('ws-1', 'pending-123', 'admin@test.com')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('rejectTransaction', () => {
    it('marks transaction as rejected', async () => {
      const tx = makeTx({ webhookUrl: 'https://hooks.example.com/notify' })
      mockStore.get.mockResolvedValue(tx)

      const result = await rejectTransaction('ws-1', 'pending-123', 'admin@test.com', 'Suspicious')

      expect(result.success).toBe(true)
      expect(result.status).toBe('rejected')
      expect(mockStore.update).toHaveBeenCalledWith(
        'ws-1',
        'pending-123',
        expect.objectContaining({
          status: 'rejected',
          resolvedBy: 'admin@test.com',
          error: 'Suspicious',
        })
      )

      // Webhook fired
      await new Promise((r) => setTimeout(r, 1))
      const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(body.type).toBe('approval_resolved')
      expect(body.status).toBe('rejected')
    })

    it('returns failure for non-pending transaction', async () => {
      const tx = makeTx({ status: 'executed' })
      mockStore.get.mockResolvedValue(tx)

      const result = await rejectTransaction('ws-1', 'pending-123', 'admin@test.com')

      expect(result.success).toBe(false)
      expect(result.status).toBe('executed')
    })
  })

  describe('listPending', () => {
    it('delegates to store.list()', async () => {
      const txs = [makeTx(), makeTx({ id: 'pending-456' })]
      mockStore.list.mockResolvedValue(txs)

      const result = await listPending('ws-1', 'pending')

      expect(result).toEqual(txs)
      expect(mockStore.list).toHaveBeenCalledWith('ws-1', 'pending')
    })
  })

  describe('getTransaction', () => {
    it('delegates to store.get()', async () => {
      const tx = makeTx()
      mockStore.get.mockResolvedValue(tx)

      const result = await getTransaction('ws-1', 'pending-123')

      expect(result).toEqual(tx)
      expect(mockStore.get).toHaveBeenCalledWith('ws-1', 'pending-123')
    })
  })

  describe('getTransactionById', () => {
    it('delegates to store.getById()', async () => {
      const tx = makeTx()
      mockStore.getById.mockResolvedValue(tx)

      const result = await getTransactionById('pending-123')

      expect(result).toEqual(tx)
      expect(mockStore.getById).toHaveBeenCalledWith('pending-123')
    })
  })
})
