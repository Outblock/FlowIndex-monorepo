import { randomUUID } from 'node:crypto'
import { createLogger } from '@sim/logger'
import { encryptSecret, decryptSecret } from '@/lib/core/security/encryption'
import { buildCallbackUrls } from '@/lib/approval/token'
import { getApprovalStore } from '@/lib/approval/store'
import type { PendingTransaction, SignerConfig } from '@/lib/approval/types'

const logger = createLogger('approval/service')

/** Default expiration in seconds (15 minutes) */
const DEFAULT_EXPIRES_IN = 900

/** Webhook request timeout in milliseconds */
const WEBHOOK_TIMEOUT_MS = 5_000

/** Flow access node URLs by network */
const ACCESS_NODES: Record<string, string> = {
  mainnet: 'https://rest-mainnet.onflow.org',
  testnet: 'https://rest-testnet.onflow.org',
}

/** Parameters for queueing a new transaction */
export interface QueueTransactionParams {
  workspaceId: string
  userId: string
  workflowId?: string
  mode: 'approve-only' | 'passkey-sign'
  cadence: string
  arguments: string
  network: 'mainnet' | 'testnet'
  signerAddress?: string
  templateId?: string
  signerConfig?: SignerConfig
  simulation?: PendingTransaction['simulation']
  webhookUrl?: string
  expiresIn?: number
}

/** Result returned from queueTransaction */
export interface QueueTransactionResult {
  pendingId: string
  approveUrl: string
  rejectUrl: string
  detailsUrl: string
  expiresAt: number
}

/** Result returned from approveTransaction */
export interface ApproveTransactionResult {
  success: boolean
  status: PendingTransaction['status']
  txId?: string
  error?: string
}

/** Result returned from rejectTransaction */
export interface RejectTransactionResult {
  success: boolean
  status: PendingTransaction['status']
}

/**
 * Send a webhook notification (fire-and-forget).
 * Errors are logged but never thrown.
 */
async function sendWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })
    logger.info('Webhook sent', { url, type: payload.type })
  } catch (error) {
    logger.warn('Webhook delivery failed', { url, error })
  }
}

/**
 * Queue a transaction for human approval.
 *
 * Creates a PendingTransaction in the store, optionally encrypts the signer
 * config, builds callback URLs, and fires a webhook notification.
 */
export async function queueTransaction(
  params: QueueTransactionParams
): Promise<QueueTransactionResult> {
  const store = getApprovalStore()
  const pendingId = randomUUID()
  const now = Date.now()
  const expiresIn = params.expiresIn ?? DEFAULT_EXPIRES_IN
  const expiresAt = now + expiresIn * 1000

  let encryptedSignerConfig: string | undefined
  if (params.signerConfig) {
    const { encrypted } = await encryptSecret(JSON.stringify(params.signerConfig))
    encryptedSignerConfig = encrypted
  }

  const baseUrl = process.env.APPROVAL_BASE_URL || 'https://studio.flowindex.io'
  const urls = buildCallbackUrls(baseUrl, pendingId, expiresAt)

  const tx: PendingTransaction = {
    id: pendingId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    workflowId: params.workflowId,
    mode: params.mode,
    cadence: params.cadence,
    arguments: params.arguments,
    network: params.network,
    signerAddress: params.signerAddress,
    templateId: params.templateId,
    encryptedSignerConfig,
    simulation: params.simulation,
    webhookUrl: params.webhookUrl,
    callbackBaseUrl: baseUrl,
    status: 'pending',
    createdAt: now,
    expiresAt,
  }

  await store.create(tx)
  logger.info('Transaction queued for approval', { pendingId, workspaceId: params.workspaceId })

  if (params.webhookUrl) {
    sendWebhook(params.webhookUrl, {
      type: 'approval_requested',
      pendingId,
      mode: params.mode,
      summary: {
        templateId: params.templateId,
        network: params.network,
        signerAddress: params.signerAddress,
        arguments: params.arguments,
      },
      actions: {
        approve: urls.approveUrl,
        reject: urls.rejectUrl,
        details: urls.detailsUrl,
      },
      expiresAt: new Date(expiresAt).toISOString(),
    })
  }

  return {
    pendingId,
    approveUrl: urls.approveUrl,
    rejectUrl: urls.rejectUrl,
    detailsUrl: urls.detailsUrl,
    expiresAt,
  }
}

/**
 * Approve a pending transaction.
 *
 * If `execute` is true and the mode is `approve-only`, the transaction is
 * submitted on-chain using the decrypted signer config.
 */
export async function approveTransaction(
  workspaceId: string,
  pendingId: string,
  resolvedBy: string,
  execute?: boolean
): Promise<ApproveTransactionResult> {
  const store = getApprovalStore()
  const tx = await store.get(workspaceId, pendingId)

  if (!tx) {
    return { success: false, status: 'pending', error: 'Transaction not found' }
  }

  if (tx.status !== 'pending') {
    return { success: false, status: tx.status, error: `Transaction already ${tx.status}` }
  }

  if (Date.now() > tx.expiresAt) {
    await store.update(workspaceId, pendingId, { status: 'expired' })
    return { success: false, status: 'expired', error: 'Transaction has expired' }
  }

  const now = Date.now()
  await store.update(workspaceId, pendingId, {
    status: 'approved',
    resolvedBy,
    resolvedAt: now,
  })

  let txId: string | undefined
  let finalStatus: PendingTransaction['status'] = 'approved'

  if (execute && tx.mode === 'approve-only' && tx.encryptedSignerConfig) {
    try {
      const { decrypted } = await decryptSecret(tx.encryptedSignerConfig)
      const signerConfig = JSON.parse(decrypted) as SignerConfig

      const { resolveSignerFromParams } = await import('@/lib/flow/signer-resolver')
      const { authz } = await resolveSignerFromParams({
        signerMode: signerConfig.signerMode,
        signerAddress: signerConfig.signerAddress,
        signerPrivateKey: signerConfig.signerPrivateKey,
        signerKeyId: signerConfig.signerKeyId,
        signerCredentialId: signerConfig.signerCredentialId,
      })

      const fcl = await import('@onflow/fcl')
      await fcl.config().put('accessNode.api', ACCESS_NODES[tx.network])

      const parsedArgs = JSON.parse(tx.arguments)
      txId = await fcl.mutate({
        cadence: tx.cadence,
        args: () => parsedArgs,
        proposer: authz,
        payer: authz,
        authorizations: [authz],
      })

      await fcl.tx(txId).onceSealed()
      finalStatus = 'executed'

      await store.update(workspaceId, pendingId, {
        status: 'executed',
        txId,
      })

      logger.info('Transaction executed', { pendingId, txId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await store.update(workspaceId, pendingId, {
        status: 'approved',
        error: message,
      })
      logger.error('Transaction execution failed', { pendingId, error: message })
      return { success: true, status: 'approved', error: message }
    }
  }

  if (tx.webhookUrl) {
    sendWebhook(tx.webhookUrl, {
      type: 'approval_resolved',
      pendingId,
      status: finalStatus,
      txId,
      resolvedBy,
    })
  }

  return { success: true, status: finalStatus, txId }
}

/**
 * Reject a pending transaction.
 */
export async function rejectTransaction(
  workspaceId: string,
  pendingId: string,
  resolvedBy: string,
  reason?: string
): Promise<RejectTransactionResult> {
  const store = getApprovalStore()
  const tx = await store.get(workspaceId, pendingId)

  if (!tx) {
    return { success: false, status: 'pending' }
  }

  if (tx.status !== 'pending') {
    return { success: false, status: tx.status }
  }

  if (Date.now() > tx.expiresAt) {
    await store.update(workspaceId, pendingId, { status: 'expired' })
    return { success: false, status: 'expired' }
  }

  await store.update(workspaceId, pendingId, {
    status: 'rejected',
    resolvedBy,
    resolvedAt: Date.now(),
    error: reason,
  })

  logger.info('Transaction rejected', { pendingId, resolvedBy, reason })

  if (tx.webhookUrl) {
    sendWebhook(tx.webhookUrl, {
      type: 'approval_resolved',
      pendingId,
      status: 'rejected',
      resolvedBy,
    })
  }

  return { success: true, status: 'rejected' }
}

/**
 * List pending transactions for a workspace.
 */
export async function listPending(
  workspaceId: string,
  status?: string
): Promise<PendingTransaction[]> {
  const store = getApprovalStore()
  return store.list(workspaceId, status)
}

/**
 * Get a specific transaction by workspace and ID.
 */
export async function getTransaction(
  workspaceId: string,
  pendingId: string
): Promise<PendingTransaction | null> {
  const store = getApprovalStore()
  return store.get(workspaceId, pendingId)
}

/**
 * Get a transaction by ID only (for public API with token auth).
 */
export async function getTransactionById(
  pendingId: string
): Promise<PendingTransaction | null> {
  const store = getApprovalStore()
  return store.getById(pendingId)
}
