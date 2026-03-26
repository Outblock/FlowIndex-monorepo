/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/config/redis', () => ({
  getRedisClient: vi.fn(() => null),
}))

import { MemoryApprovalStore } from './store'
import type { PendingTransaction } from './types'

function makeTx(overrides: Partial<PendingTransaction> = {}): PendingTransaction {
  return {
    id: 'test-id',
    workspaceId: 'ws-1',
    userId: 'user-1',
    mode: 'approve-only',
    cadence: 'transaction() {}',
    arguments: '[]',
    network: 'mainnet',
    callbackBaseUrl: 'https://example.com',
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: Date.now() + 900_000,
    ...overrides,
  }
}

describe('MemoryApprovalStore', () => {
  let store: MemoryApprovalStore

  beforeEach(() => {
    store = new MemoryApprovalStore()
  })

  it('creates and retrieves a transaction', async () => {
    const tx = makeTx()
    await store.create(tx)
    const result = await store.get('ws-1', 'test-id')
    expect(result).toEqual(tx)
  })

  it('returns null for non-existent transaction', async () => {
    const result = await store.get('ws-1', 'nope')
    expect(result).toBeNull()
  })

  it('returns null for expired transaction (lazy expiry)', async () => {
    const tx = makeTx({ expiresAt: Date.now() - 1000 })
    await store.create(tx)
    const result = await store.get('ws-1', 'test-id')
    expect(result).toBeNull()
  })

  it('getById resolves via global index', async () => {
    const tx = makeTx({ id: 'global-test' })
    await store.create(tx)
    const result = await store.getById('global-test')
    expect(result?.id).toBe('global-test')
    expect(result?.workspaceId).toBe('ws-1')
  })

  it('getById returns null for unknown id', async () => {
    const result = await store.getById('unknown')
    expect(result).toBeNull()
  })

  it('lists transactions by workspace', async () => {
    await store.create(makeTx({ id: 'tx-1', workspaceId: 'ws-1' }))
    await store.create(makeTx({ id: 'tx-2', workspaceId: 'ws-1' }))
    await store.create(makeTx({ id: 'tx-3', workspaceId: 'ws-2' }))
    const list = await store.list('ws-1')
    expect(list).toHaveLength(2)
  })

  it('lists transactions filtered by status', async () => {
    await store.create(makeTx({ id: 'tx-1', status: 'pending' }))
    await store.create(makeTx({ id: 'tx-2', status: 'approved' }))
    const list = await store.list('ws-1', 'pending')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('tx-1')
  })

  it('updates a transaction', async () => {
    await store.create(makeTx())
    await store.update('ws-1', 'test-id', { status: 'approved', resolvedBy: 'user-2' })
    const result = await store.get('ws-1', 'test-id')
    expect(result?.status).toBe('approved')
    expect(result?.resolvedBy).toBe('user-2')
  })

  it('deletes a transaction', async () => {
    await store.create(makeTx())
    await store.delete('ws-1', 'test-id')
    const result = await store.get('ws-1', 'test-id')
    expect(result).toBeNull()
  })

  it('excludes expired pending from list', async () => {
    await store.create(makeTx({ id: 'tx-expired', expiresAt: Date.now() - 1000 }))
    await store.create(makeTx({ id: 'tx-valid' }))
    const list = await store.list('ws-1')
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('tx-valid')
  })
})
