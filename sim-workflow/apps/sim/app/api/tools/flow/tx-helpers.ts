/**
 * Shared helpers for Flow transaction API routes.
 * Reuses the same FCL + signing pattern from send-transaction/route.ts.
 */

import { httpTransport } from '@onflow/transport-http'
import { LocalSigner, createAuthzFromSigner } from '@flowindex/flow-signer'
import { ec as EC } from 'elliptic'
import { SHA3 } from 'sha3'

export const ACCESS_NODES: Record<string, string> = {
  mainnet: 'https://rest-mainnet.onflow.org',
  testnet: 'https://rest-testnet.onflow.org',
}

const DEFAULT_SEAL_TIMEOUT_MS = 30_000
const FLOWINDEX_URL = process.env.FLOWINDEX_API_URL || 'https://flowindex.io'

interface FlowTxEvent {
  type: string
  data?: Record<string, unknown>
}

export interface FlowTxStatus {
  status: number
  errorMessage: string
  events?: FlowTxEvent[]
}

const DEFAULT_SEAL_POLL_INTERVAL_MS = 1_000

const FLOW_TX_STATUS_MAP: Record<string, number> = {
  UNKNOWN: 0,
  PENDING: 1,
  FINALIZED: 2,
  EXECUTED: 3,
  SEALED: 4,
  EXPIRED: 5,
}

function getSealTimeoutMs(): number {
  const raw = Number(process.env.FLOW_TX_SEAL_TIMEOUT_MS ?? DEFAULT_SEAL_TIMEOUT_MS)
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_SEAL_TIMEOUT_MS
  }
  return raw
}

function normalizePrivateKeyHex(privateKey: string): string {
  const normalized = privateKey.trim().replace(/^0x/i, '').toLowerCase()
  if (normalized.length === 0) {
    throw new Error('Private key is required')
  }
  return normalized
}

export function signWithKey(privateKey: string, message: string): string {
  const ec = new EC('p256')
  const normalizedPrivateKey = normalizePrivateKeyHex(privateKey)
  const key = ec.keyFromPrivate(Buffer.from(normalizedPrivateKey, 'hex'))
  const sha3 = new SHA3(256)
  sha3.update(Buffer.from(message, 'hex'))
  const digest = sha3.digest()
  const sig = key.sign(digest)
  const r = sig.r.toArrayLike(Buffer, 'be', 32)
  const s = sig.s.toArrayLike(Buffer, 'be', 32)
  return Buffer.concat([r, s]).toString('hex')
}

/**
 * Creates an FCL-compatible authorization function for signing transactions.
 */
export async function createAuthz(
  address: string,
  privateKey: string,
  network: string,
  keyIndex?: number
) {
  const signer = new LocalSigner(
    {
      flowindexUrl: FLOWINDEX_URL,
      network: network === 'testnet' ? 'testnet' : 'mainnet',
    },
    {
      address,
      privateKey,
      ...(keyIndex !== undefined ? { keyIndex } : {}),
    }
  )

  await signer.init()
  return createAuthzFromSigner(signer)
}

/** FCL authorization type helper */
export type FclAuthz = Parameters<typeof import('@onflow/fcl').mutate>[0] extends {
  proposer?: infer P
}
  ? P
  : never

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchTransactionResult(
  accessNode: string,
  txId: string
): Promise<{
  txStatus: FlowTxStatus
  isTerminal: boolean
} | null> {
  const response = await fetch(`${accessNode}/v1/transaction_results/${txId}`)

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch Flow transaction result (${response.status})`)
  }

  const data = (await response.json()) as {
    status?: string
    error_message?: string
    events?: Array<{ type?: string; payload?: { type?: string; value?: Record<string, unknown> } }>
  }

  const statusLabel = String(data.status ?? 'UNKNOWN').toUpperCase()
  const txStatus: FlowTxStatus = {
    status: FLOW_TX_STATUS_MAP[statusLabel] ?? FLOW_TX_STATUS_MAP.UNKNOWN,
    errorMessage: typeof data.error_message === 'string' ? data.error_message.trim() : '',
    events: Array.isArray(data.events)
      ? data.events
          .filter((event): event is { type: string; payload?: { value?: Record<string, unknown> } } =>
            typeof event?.type === 'string'
          )
          .map((event) => ({
            type: event.type,
            data:
              event.payload && typeof event.payload.value === 'object' && event.payload.value !== null
                ? event.payload.value
                : undefined,
          }))
      : undefined,
  }

  return {
    txStatus,
    isTerminal: statusLabel === 'SEALED' || statusLabel === 'EXPIRED',
  }
}

/**
 * Wait for a transaction to seal, but never indefinitely.
 * Returns `txStatus: null` when the timeout elapses first so callers can
 * surface a submitted transaction instead of hanging the workflow run.
 */
export async function waitForSeal(
  txId: string,
  accessNode: string,
  timeoutMs: number = getSealTimeoutMs()
): Promise<{ txStatus: FlowTxStatus | null; timedOut: boolean; timeoutMs: number }> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const result = await fetchTransactionResult(accessNode, txId)
    if (result?.isTerminal) {
      return { txStatus: result.txStatus, timedOut: false, timeoutMs }
    }

    const elapsed = Date.now() - startedAt
    const remaining = timeoutMs - elapsed
    if (remaining <= 0) {
      break
    }

    await sleep(Math.min(DEFAULT_SEAL_POLL_INTERVAL_MS, remaining))
  }

  return { txStatus: null, timedOut: true, timeoutMs }
}

/**
 * Send a transaction via FCL with a single signer.
 * Supports two modes:
 *  - Legacy: provide signerAddress + signerPrivateKey
 *  - Authz: provide a pre-resolved authz function
 * Returns { txId, txStatus }.
 */
export async function sendTransaction(opts: {
  cadence: string
  args: unknown[]
  signerAddress?: string
  signerPrivateKey?: string
  authz?: unknown
  network: string
}): Promise<{ txId: string; txStatus: FlowTxStatus | null; timedOut: boolean; timeoutMs: number }> {
  const fcl = await import('@onflow/fcl')

  const accessNode = ACCESS_NODES[opts.network]
  if (!accessNode) {
    throw new Error(`Invalid network: ${opts.network}. Use "mainnet" or "testnet".`)
  }

  fcl.config().put('accessNode.api', accessNode).put('sdk.transport', httpTransport)

  let typedAuthz: FclAuthz
  if (opts.authz) {
    typedAuthz = opts.authz as unknown as FclAuthz
  } else if (opts.signerAddress && opts.signerPrivateKey) {
    const authz = await createAuthz(opts.signerAddress, opts.signerPrivateKey, opts.network)
    typedAuthz = authz as unknown as FclAuthz
  } else {
    throw new Error('Either authz or signerAddress+signerPrivateKey must be provided')
  }

  const txId: string = await fcl.mutate({
    cadence: opts.cadence,
    args: () => opts.args,
    proposer: typedAuthz,
    payer: typedAuthz,
    authorizations: [typedAuthz] as unknown as FclAuthz[],
    limit: 9999,
  })

  const { txStatus, timedOut, timeoutMs } = await waitForSeal(txId, accessNode)

  return { txId, txStatus, timedOut, timeoutMs }
}

/**
 * Send a transaction via FCL with multiple signers.
 * The first signer is the proposer and payer.
 */
export async function sendMultiSignTransaction(opts: {
  cadence: string
  args: unknown[]
  signers: Array<{ address: string; privateKey: string; keyIndex: number }>
  network: string
}): Promise<{ txId: string; txStatus: FlowTxStatus | null; timedOut: boolean; timeoutMs: number }> {
  const fcl = await import('@onflow/fcl')

  const accessNode = ACCESS_NODES[opts.network]
  if (!accessNode) {
    throw new Error(`Invalid network: ${opts.network}. Use "mainnet" or "testnet".`)
  }

  fcl.config().put('accessNode.api', accessNode).put('sdk.transport', httpTransport)

  const authzFunctions = await Promise.all(
    opts.signers.map((signer) =>
      createAuthz(signer.address, signer.privateKey, opts.network, signer.keyIndex)
    )
  )

  const proposer = authzFunctions[0] as unknown as FclAuthz
  const payer = authzFunctions[0] as unknown as FclAuthz
  const authorizations = authzFunctions as unknown as FclAuthz[]

  const txId: string = await fcl.mutate({
    cadence: opts.cadence,
    args: () => opts.args,
    proposer,
    payer,
    authorizations,
    limit: 9999,
  })

  const { txStatus, timedOut, timeoutMs } = await waitForSeal(txId, accessNode)

  return { txId, txStatus, timedOut, timeoutMs }
}

/**
 * Format a standard transaction result into API response.
 */
export function formatTxResult(
  txId: string,
  txStatus: FlowTxStatus | null,
  opts?: { timedOut?: boolean; timeoutMs?: number }
) {
  if (opts?.timedOut || txStatus === null) {
    const timeoutSecs = Math.ceil((opts?.timeoutMs ?? DEFAULT_SEAL_TIMEOUT_MS) / 1000)
    return {
      content:
        `Transaction ${txId} submitted successfully, but it did not seal within ${timeoutSecs}s. ` +
        'Check the transaction later using the transaction ID.',
      transactionId: txId,
      status: 'SUBMITTED',
    }
  }

  const statusLabel = txStatus.errorMessage ? 'ERROR' : 'SEALED'
  const content = txStatus.errorMessage
    ? `Transaction ${txId} failed: ${txStatus.errorMessage}`
    : `Transaction ${txId} sealed successfully (status: ${txStatus.status})`

  return { content, transactionId: txId, status: statusLabel }
}
