/** Signer configuration captured at queue time (encrypted at rest) */
export interface SignerConfig {
  signerMode: 'legacy' | 'cloud' | 'passkey'
  signerAddress?: string
  signerPrivateKey?: string
  signerKeyId?: string
  signerCredentialId?: string
}

/** A transaction waiting for human approval */
export interface PendingTransaction {
  id: string
  workflowId?: string
  workspaceId: string
  userId: string

  mode: 'approve-only' | 'passkey-sign'
  cadence: string
  arguments: string
  network: 'mainnet' | 'testnet'
  signerAddress?: string
  templateId?: string

  /** AES-256-GCM encrypted SignerConfig JSON */
  encryptedSignerConfig?: string

  simulation?: {
    success: boolean
    events: Array<{ type: string; payload: unknown }>
    computationUsed: number
    balanceChanges: Array<{ address: string; token: string; delta: string }>
  }

  webhookUrl?: string
  callbackBaseUrl: string

  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed'
  createdAt: number
  expiresAt: number
  resolvedBy?: string
  resolvedAt?: number
  txId?: string
  error?: string
}

/** Abstract approval store interface */
export interface ApprovalStore {
  create(tx: PendingTransaction): Promise<void>
  get(workspaceId: string, id: string): Promise<PendingTransaction | null>
  /** Get by ID only (uses global index to resolve workspaceId) — for public API */
  getById(id: string): Promise<PendingTransaction | null>
  list(workspaceId: string, status?: string): Promise<PendingTransaction[]>
  update(workspaceId: string, id: string, patch: Partial<PendingTransaction>): Promise<void>
  delete(workspaceId: string, id: string): Promise<void>
}
