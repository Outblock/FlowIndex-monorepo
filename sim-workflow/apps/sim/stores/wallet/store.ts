import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createLogger } from '@sim/logger'
import type { CloudKey, PasskeyAccount, SignerOption, WalletState } from './types'

const logger = createLogger('WalletStore')

const FLOWINDEX_API_URL = process.env.NEXT_PUBLIC_FLOWINDEX_API_URL || 'https://flowindex.io'
const STALE_TIME = 5 * 60 * 1000

const initialState = {
  keys: [] as CloudKey[],
  passkeyAccounts: [] as PasskeyAccount[],
  isLoading: false,
  error: null as string | null,
  lastFetched: null as number | null,
}

export const useWalletStore = create<WalletState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchWallets: async (fiAuthToken: string) => {
        const { lastFetched, isLoading } = get()
        if (isLoading) return
        if (lastFetched && Date.now() - lastFetched < STALE_TIME) return

        set({ isLoading: true, error: null })
        try {
          const res = await fetch(`${FLOWINDEX_API_URL}/api/v1/wallet/me`, {
            headers: { Authorization: `Bearer ${fiAuthToken}` },
          })
          if (!res.ok) throw new Error(`Wallet API error: ${res.status}`)
          const data = (await res.json()) as {
            keys?: CloudKey[]
            passkey_accounts?: PasskeyAccount[]
          }
          set({
            keys: data.keys ?? [],
            passkeyAccounts: data.passkey_accounts ?? [],
            isLoading: false,
            lastFetched: Date.now(),
          })
        } catch (err) {
          logger.error('Failed to fetch wallets', { error: err })
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load wallets',
          })
        }
      },

      getSignerOptions: (): SignerOption[] => {
        const { keys, passkeyAccounts } = get()
        const options: SignerOption[] = []

        for (const key of keys) {
          options.push({
            id: `cloud:${key.id}`,
            label: `${key.label || 'Cloud Key'}: ${key.flowAddress} (${key.sigAlgo})`,
            type: 'cloud',
            flowAddress: key.flowAddress,
            keyIndex: key.keyIndex,
            sigAlgo: key.sigAlgo,
            hashAlgo: key.hashAlgo,
            keyId: key.id,
          })
        }

        for (const pk of passkeyAccounts) {
          options.push({
            id: `passkey:${pk.credentialId}`,
            label: `Passkey: ${pk.walletName || pk.flowAddress}`,
            type: 'passkey',
            flowAddress: pk.flowAddress,
            keyIndex: 0,
            sigAlgo: 'ECDSA_P256',
            hashAlgo: 'SHA2_256',
            credentialId: pk.credentialId,
          })
        }

        return options
      },

      reset: () => set(initialState),
    }),
    { name: 'wallet-store' }
  )
)
