/**
 * A cloud-managed signing key associated with a Flow address.
 */
export interface CloudKey {
  id: string
  label: string
  flowAddress: string
  publicKey: string
  keyIndex: number
  sigAlgo: string
  hashAlgo: string
  source: 'imported' | 'created'
}

/**
 * A passkey-backed Flow account registered via WebAuthn.
 */
export interface PasskeyAccount {
  credentialId: string
  flowAddress: string
  publicKey: string
  walletName?: string
}

/**
 * A unified signer option derived from cloud keys or passkey accounts,
 * used to populate signing dropdowns in the workflow editor.
 */
export interface SignerOption {
  id: string
  label: string
  type: 'cloud' | 'passkey' | 'manual'
  flowAddress: string
  keyIndex: number
  sigAlgo: string
  hashAlgo: string
  keyId?: string
  credentialId?: string
}

/**
 * Wallet store state and actions.
 */
export interface WalletState {
  keys: CloudKey[]
  passkeyAccounts: PasskeyAccount[]
  isLoading: boolean
  error: string | null
  lastFetched: number | null

  /** Fetches cloud keys and passkey accounts from the FlowIndex API. Skips if data is fresh. */
  fetchWallets: (fiAuthToken: string) => Promise<void>
  /** Returns a unified list of signer options derived from all loaded wallet sources. */
  getSignerOptions: () => SignerOption[]
  /** Resets store to initial state. */
  reset: () => void
}
