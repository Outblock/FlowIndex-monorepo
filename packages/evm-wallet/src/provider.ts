import {
  type Address,
  type Hex,
  toHex,
} from "viem"
import { createBundlerClient } from "./bundler-client"
import { isSmartWalletDeployed } from "./factory"
import { deploySmartWallet, sendSmartWalletTransaction, type CallParams } from "./user-op"
import { signMessageWithPasskey, signTypedDataWithPasskey } from "./signer"

type EventName = "accountsChanged" | "chainChanged" | "disconnect"
type EventHandler = (...args: any[]) => void

export interface EvmWalletProviderConfig {
  smartWalletAddress: Address
  rpcUrl: string
  bundlerUrl: string
  publicKeySec1Hex: string
  credentialId: string
  isDeployed: boolean
  chainId?: number
  paymasterUrl?: string
}

export function createEvmWalletProvider(config: EvmWalletProviderConfig) {
  const {
    smartWalletAddress,
    rpcUrl,
    bundlerUrl,
    publicKeySec1Hex,
    credentialId,
    chainId = 747,
    paymasterUrl,
  } = config
  let isDeployed = config.isDeployed

  const bundlerClient = createBundlerClient(bundlerUrl)
  const listeners = new Map<EventName, Set<EventHandler>>()

  function emit(event: EventName, ...args: any[]) {
    listeners.get(event)?.forEach((fn) => fn(...args))
  }

  async function proxyToRpc(method: string, params?: any[]): Promise<any> {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
    })
    const json = await res.json()
    if (json.error) throw new Error(json.error.message)
    return json.result
  }

  const readMethods = new Set([
    "eth_call",
    "eth_estimateGas",
    "eth_getBalance",
    "eth_getTransactionReceipt",
    "eth_blockNumber",
    "eth_getCode",
    "eth_getTransactionByHash",
    "eth_getBlockByNumber",
    "eth_getBlockByHash",
    "eth_getLogs",
    "eth_gasPrice",
    "eth_getTransactionCount",
    "net_version",
  ])

  return {
    isMetaMask: false,

    async request({ method, params }: { method: string; params?: any[] }): Promise<any> {
      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        return [smartWalletAddress]
      }
      if (method === "eth_chainId") {
        return toHex(chainId)
      }

      if (readMethods.has(method)) {
        return proxyToRpc(method, params)
      }

      if (method === "eth_sendTransaction") {
        const [tx] = params ?? []
        const deployed = isDeployed || await isSmartWalletDeployed(smartWalletAddress, { rpcUrl })
        const call: CallParams = {
          target: tx.to as Address,
          value: tx.value ? BigInt(tx.value) : 0n,
          data: (tx.data ?? "0x") as Hex,
        }

        const result = await sendSmartWalletTransaction({
          sender: smartWalletAddress,
          call,
          publicKeySec1Hex,
          rpcUrl,
          bundlerClient,
          chainId,
          credentialId,
          isDeployed: deployed,
          paymasterUrl,
        })

        isDeployed = true
        return result.transactionHash ?? result.userOpHash
      }

      if (method === "personal_sign" || method === "eth_signTypedData_v4") {
        if (!isDeployed) {
          const deployed = await isSmartWalletDeployed(smartWalletAddress, { rpcUrl })
          if (!deployed) {
            await deploySmartWallet({
              sender: smartWalletAddress,
              publicKeySec1Hex,
              credentialId,
              rpcUrl,
              bundlerClient,
              chainId,
              paymasterUrl,
            })
          }
          isDeployed = true
        }

        if (method === "personal_sign") {
          return signMessageWithPasskey(
            extractPersonalSignMessage(params, smartWalletAddress),
            credentialId,
            smartWalletAddress,
            chainId,
          )
        }

        return signTypedDataWithPasskey(
          extractTypedData(params, smartWalletAddress),
          credentialId,
          smartWalletAddress,
          chainId,
        )
      }

      if (method === "wallet_switchEthereumChain") {
        throw new Error("Chain switching not supported. This wallet operates on Flow EVM only.")
      }

      return proxyToRpc(method, params)
    },

    on(event: EventName, handler: EventHandler) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    },

    removeListener(event: EventName, handler: EventHandler) {
      listeners.get(event)?.delete(handler)
    },
  }
}

export type EvmWalletProvider = ReturnType<typeof createEvmWalletProvider>

function extractPersonalSignMessage(params: any[] | undefined, account: Address): string | Hex {
  const [first, second] = params ?? []
  if (typeof first !== "string" && typeof second !== "string") {
    throw new Error("personal_sign requires message params")
  }

  if (typeof first === "string" && first.toLowerCase() === account.toLowerCase()) {
    return second as string | Hex
  }

  if (typeof second === "string" && second.toLowerCase() === account.toLowerCase()) {
    return first as string | Hex
  }

  return first as string | Hex
}

function extractTypedData(params: any[] | undefined, account: Address): any {
  const [first, second] = params ?? []
  let typedDataParam = second

  if (typeof first === "string" && first.toLowerCase() === account.toLowerCase()) {
    typedDataParam = second
  } else if (typeof second === "string" && second.toLowerCase() === account.toLowerCase()) {
    typedDataParam = first
  }

  if (!typedDataParam) {
    throw new Error("eth_signTypedData_v4 requires typed data params")
  }

  return typeof typedDataParam === "string" ? JSON.parse(typedDataParam) : typedDataParam
}
