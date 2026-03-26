import { createLogger } from '@sim/logger'
import { getRedisClient } from '@/lib/core/config/redis'
import type { ApprovalStore, PendingTransaction } from '@/lib/approval/types'

const logger = createLogger('ApprovalStore')

/** TTL for pending transactions (15 minutes) */
const PENDING_TTL_SECONDS = 900

/** TTL for resolved transactions (24 hours) */
const RESOLVED_TTL_SECONDS = 86_400

/** Background cleanup interval for memory store (60 seconds) */
const CLEANUP_INTERVAL_MS = 60_000

/**
 * Check whether a pending transaction has expired.
 * Only pending transactions expire — resolved ones are kept.
 */
function isExpired(tx: PendingTransaction): boolean {
  return tx.status === 'pending' && Date.now() > tx.expiresAt
}

/**
 * In-memory approval store backed by nested Maps.
 * Uses lazy expiry on reads and periodic background cleanup.
 */
export class MemoryApprovalStore implements ApprovalStore {
  /** workspaceId -> (id -> PendingTransaction) */
  private store = new Map<string, Map<string, PendingTransaction>>()

  /** id -> workspaceId (global reverse index for getById) */
  private globalIndex = new Map<string, string>()

  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS)
  }

  async create(tx: PendingTransaction): Promise<void> {
    let workspace = this.store.get(tx.workspaceId)
    if (!workspace) {
      workspace = new Map()
      this.store.set(tx.workspaceId, workspace)
    }
    workspace.set(tx.id, tx)
    this.globalIndex.set(tx.id, tx.workspaceId)
  }

  async get(workspaceId: string, id: string): Promise<PendingTransaction | null> {
    const tx = this.store.get(workspaceId)?.get(id) ?? null
    if (tx && isExpired(tx)) {
      this.store.get(workspaceId)?.delete(id)
      this.globalIndex.delete(id)
      return null
    }
    return tx
  }

  async getById(id: string): Promise<PendingTransaction | null> {
    const workspaceId = this.globalIndex.get(id)
    if (!workspaceId) return null
    return this.get(workspaceId, id)
  }

  async list(workspaceId: string, status?: string): Promise<PendingTransaction[]> {
    const workspace = this.store.get(workspaceId)
    if (!workspace) return []

    const result: PendingTransaction[] = []
    for (const [id, tx] of workspace) {
      if (isExpired(tx)) {
        workspace.delete(id)
        this.globalIndex.delete(id)
        continue
      }
      if (status && tx.status !== status) continue
      result.push(tx)
    }
    return result
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<PendingTransaction>
  ): Promise<void> {
    const workspace = this.store.get(workspaceId)
    const tx = workspace?.get(id)
    if (!tx) return
    Object.assign(tx, patch)
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    this.store.get(workspaceId)?.delete(id)
    this.globalIndex.delete(id)
  }

  /** Remove expired pending transactions across all workspaces */
  private cleanup(): void {
    for (const [wsId, workspace] of this.store) {
      for (const [id, tx] of workspace) {
        if (isExpired(tx)) {
          workspace.delete(id)
          this.globalIndex.delete(id)
        }
      }
      if (workspace.size === 0) {
        this.store.delete(wsId)
      }
    }
  }

  /** Stop background cleanup (for graceful shutdown / tests) */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}

/**
 * Redis-backed approval store with automatic TTL expiry.
 *
 * Key layout:
 * - `approval:{workspaceId}:{id}` — JSON-serialized PendingTransaction
 * - `approval_index:{workspaceId}` — Set of transaction IDs for list()
 * - `approval_global:{id}` — workspaceId string for getById()
 */
export class RedisApprovalStore implements ApprovalStore {
  private redis: ReturnType<typeof getRedisClient>

  constructor() {
    this.redis = getRedisClient()
  }

  private dataKey(workspaceId: string, id: string): string {
    return `approval:${workspaceId}:${id}`
  }

  private indexKey(workspaceId: string): string {
    return `approval_index:${workspaceId}`
  }

  private globalKey(id: string): string {
    return `approval_global:${id}`
  }

  async create(tx: PendingTransaction): Promise<void> {
    const redis = this.redis
    if (!redis) throw new Error('Redis not available')

    const ttl = Math.max(1, Math.ceil((tx.expiresAt - Date.now()) / 1000))
    const json = JSON.stringify(tx)

    const pipeline = redis.pipeline()
    pipeline.set(this.dataKey(tx.workspaceId, tx.id), json, 'EX', ttl)
    pipeline.sadd(this.indexKey(tx.workspaceId), tx.id)
    pipeline.set(this.globalKey(tx.id), tx.workspaceId, 'EX', ttl)
    await pipeline.exec()
  }

  async get(workspaceId: string, id: string): Promise<PendingTransaction | null> {
    const redis = this.redis
    if (!redis) return null

    const json = await redis.get(this.dataKey(workspaceId, id))
    if (!json) {
      // Stale index entry — clean up
      await redis.srem(this.indexKey(workspaceId), id)
      return null
    }

    const tx = JSON.parse(json) as PendingTransaction
    if (isExpired(tx)) {
      await this.delete(workspaceId, id)
      return null
    }
    return tx
  }

  async getById(id: string): Promise<PendingTransaction | null> {
    const redis = this.redis
    if (!redis) return null

    const workspaceId = await redis.get(this.globalKey(id))
    if (!workspaceId) return null
    return this.get(workspaceId, id)
  }

  async list(workspaceId: string, status?: string): Promise<PendingTransaction[]> {
    const redis = this.redis
    if (!redis) return []

    const ids = await redis.smembers(this.indexKey(workspaceId))
    if (ids.length === 0) return []

    const keys = ids.map((id) => this.dataKey(workspaceId, id))
    const values = await redis.mget(...keys)

    const result: PendingTransaction[] = []
    const staleIds: string[] = []

    for (let i = 0; i < ids.length; i++) {
      const json = values[i]
      if (!json) {
        staleIds.push(ids[i])
        continue
      }
      const tx = JSON.parse(json) as PendingTransaction
      if (isExpired(tx)) {
        staleIds.push(ids[i])
        continue
      }
      if (status && tx.status !== status) continue
      result.push(tx)
    }

    // Clean up stale index entries
    if (staleIds.length > 0) {
      await redis.srem(this.indexKey(workspaceId), ...staleIds)
    }

    return result
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<PendingTransaction>
  ): Promise<void> {
    const redis = this.redis
    if (!redis) return

    const json = await redis.get(this.dataKey(workspaceId, id))
    if (!json) return

    const tx = { ...JSON.parse(json), ...patch } as PendingTransaction

    // Resolved transactions get extended TTL
    const isResolved = tx.status !== 'pending'
    const ttl = isResolved ? RESOLVED_TTL_SECONDS : Math.max(1, Math.ceil((tx.expiresAt - Date.now()) / 1000))

    const pipeline = redis.pipeline()
    pipeline.set(this.dataKey(workspaceId, id), JSON.stringify(tx), 'EX', ttl)
    pipeline.set(this.globalKey(id), workspaceId, 'EX', ttl)
    await pipeline.exec()
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const redis = this.redis
    if (!redis) return

    const pipeline = redis.pipeline()
    pipeline.del(this.dataKey(workspaceId, id))
    pipeline.srem(this.indexKey(workspaceId), id)
    pipeline.del(this.globalKey(id))
    await pipeline.exec()
  }
}

/** Singleton approval store instance */
let singleton: ApprovalStore | null = null

/**
 * Get the singleton approval store.
 * Tries Redis first, falls back to in-memory store.
 */
export function getApprovalStore(): ApprovalStore {
  if (singleton) return singleton

  const redis = getRedisClient()
  if (redis) {
    logger.info('Using Redis approval store')
    singleton = new RedisApprovalStore()
  } else {
    logger.warn('Redis not available, using in-memory approval store')
    singleton = new MemoryApprovalStore()
  }

  return singleton
}
