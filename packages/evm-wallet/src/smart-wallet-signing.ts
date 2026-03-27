/**
 * Cross-platform smart wallet signing using @flowindex/flow-passkey.
 *
 * These functions mirror the dev-wallet's signing logic but use the
 * platform-split `getPasskeyAssertion` from flow-passkey (works on
 * both web and React Native) instead of raw `navigator.credentials`.
 *
 * All functions accept a `network` param ('mainnet' | 'testnet') and
 * resolve chain config, bundler URL, and RPC URL automatically.
 */

import { type Address, type Hex, type Hash, hashMessage, hashTypedData, createPublicClient, http } from "viem"
import { flowEvmMainnet, flowEvmTestnet, getBundlerUrl, getPaymasterUrl, ENTRYPOINT_V07_ADDRESS } from "./constants"
import { computeReplaySafeHash, derToRS, encodeWebAuthnSignature } from "./signer"
import { isSmartWalletDeployed } from "./factory"
import { createBundlerClient } from "./bundler-client"
import { buildUserOperation, submitUserOperation, waitForUserOperationReceipt, buildCallData, buildBatchCallData, type CallParams } from "./user-op"
import { computeUserOpHash } from "./constants"

export type Network = "mainnet" | "testnet"

/** Resolve chain config from network name. */
function getChainConfig(network: Network) {
  const chain = network === "mainnet" ? flowEvmMainnet : flowEvmTestnet
  return {
    chainId: chain.id,
    rpcUrl: chain.rpcUrls.default.http[0],
    bundlerUrl: getBundlerUrl(chain.id),
    paymasterUrl: getPaymasterUrl(chain.id),
  }
}

/**
 * Convert a hex hash to a Uint8Array challenge for WebAuthn.
 */
function hexToBytes(hex: Hex): Uint8Array {
  return new Uint8Array(
    (hex.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
  )
}

/**
 * Sign a raw hash with passkey via @flowindex/flow-passkey's getPasskeyAssertion.
 *
 * This is the cross-platform replacement for signer.ts's signHashWithPasskey,
 * which uses navigator.credentials.get() directly (browser-only).
 */
async function signHashWithPasskeyPortable(
  hash: Hex,
  credentialId: string,
  rpId: string,
  ownerIndex = 0n,
): Promise<Hex> {
  // Lazy import so the package works without flow-passkey installed
  // (it's an optional peer dependency)
  const { getPasskeyAssertion } = await import("@flowindex/flow-passkey")

  const challenge = hexToBytes(hash)

  const assertion = await getPasskeyAssertion({
    rpId,
    challenge,
    allowCredentials: [{ id: credentialId, type: "public-key" as const }],
  })

  const clientDataJSON = new TextDecoder().decode(assertion.clientDataJSON)
  const { r, s } = derToRS(assertion.signature)

  return encodeWebAuthnSignature({
    ownerIndex,
    authenticatorData: assertion.authenticatorData,
    clientDataJSON,
    r,
    s,
  })
}

// ─── Public API ──────────────────────────────────────────────────────

export interface SignMessageOptions {
  /** The message to sign — raw hex bytes or a string. */
  message: string | Hex
  /** WebAuthn credential ID (base64url-encoded). */
  credentialId: string
  /** The smart wallet address (for replay-safe hash computation). */
  smartWalletAddress: Address
  /** Network to use for chain ID resolution. */
  network: Network
  /** WebAuthn relying party ID (e.g., hostname). */
  rpId: string
  /** Owner index in the smart wallet's owner array (default: 0). */
  ownerIndex?: bigint
}

/**
 * Sign a personal_sign message with passkey for CoinbaseSmartWallet (ERC-1271).
 *
 * Flow:
 * 1. Hash the message (EIP-191 personal message hash)
 * 2. Compute CoinbaseSmartWallet's replaySafeHash (EIP-712)
 * 3. Get WebAuthn assertion with replaySafeHash as challenge
 * 4. Encode as CoinbaseSmartWallet-compatible signature
 */
export async function signMessageWithPasskey(opts: SignMessageOptions): Promise<Hex> {
  const { message, credentialId, smartWalletAddress, network, rpId, ownerIndex = 0n } = opts
  const { chainId } = getChainConfig(network)

  const messageHash = hashMessage(
    typeof message === "string" && message.startsWith("0x")
      ? { raw: message as Hex }
      : message,
  )

  const replaySafeHash = computeReplaySafeHash(messageHash, smartWalletAddress, chainId)
  return signHashWithPasskeyPortable(replaySafeHash, credentialId, rpId, ownerIndex)
}

export interface SignTypedDataOptions {
  /** EIP-712 typed data object (domain, types, primaryType, message). */
  typedData: Parameters<typeof hashTypedData>[0]
  /** WebAuthn credential ID (base64url-encoded). */
  credentialId: string
  /** The smart wallet address (for replay-safe hash computation). */
  smartWalletAddress: Address
  /** Network to use for chain ID resolution. */
  network: Network
  /** WebAuthn relying party ID (e.g., hostname). */
  rpId: string
  /** Owner index in the smart wallet's owner array (default: 0). */
  ownerIndex?: bigint
}

/**
 * Sign EIP-712 typed data with passkey for CoinbaseSmartWallet (ERC-1271).
 *
 * Flow:
 * 1. Hash the typed data (EIP-712 hash)
 * 2. Compute CoinbaseSmartWallet's replaySafeHash
 * 3. Get WebAuthn assertion with replaySafeHash as challenge
 * 4. Encode as CoinbaseSmartWallet-compatible signature
 */
export async function signTypedDataWithPasskey(opts: SignTypedDataOptions): Promise<Hex> {
  const { typedData, credentialId, smartWalletAddress, network, rpId, ownerIndex = 0n } = opts
  const { chainId } = getChainConfig(network)

  const typedDataHash = hashTypedData(typedData)
  const replaySafeHash = computeReplaySafeHash(typedDataHash, smartWalletAddress, chainId)
  return signHashWithPasskeyPortable(replaySafeHash, credentialId, rpId, ownerIndex)
}

export interface SendTransactionOptions {
  /** Transaction target, value, and data. Single call or batch. */
  tx: { to: Address; value?: bigint; data?: Hex } | Array<{ to: Address; value?: bigint; data?: Hex }>
  /** WebAuthn credential ID (base64url-encoded). */
  credentialId: string
  /** The smart wallet address. */
  smartWalletAddress: Address
  /** SEC1 uncompressed public key hex (04 || x || y). Needed for initCode if wallet not deployed. */
  publicKeySec1Hex: string
  /** Network to use. */
  network: Network
  /** WebAuthn relying party ID (e.g., hostname). */
  rpId: string
  /** Owner index in the smart wallet's owner array (default: 0). */
  ownerIndex?: bigint
  /** Whether to wait for the UserOp receipt (default: true). */
  waitForReceipt?: boolean
  /** Timeout for receipt polling in ms (default: 60000). */
  timeoutMs?: number
  /** Poll interval for receipt polling in ms (default: 2000). */
  pollIntervalMs?: number
}

export interface SendTransactionResult {
  /** The UserOp hash returned by the bundler. */
  userOpHash: Hash
  /** The on-chain transaction hash (only if waitForReceipt is true). */
  transactionHash?: Hash
}

/**
 * Send an EVM transaction through the smart wallet via ERC-4337 UserOp.
 *
 * Flow:
 * 1. Check if smart wallet is deployed (determines whether initCode is needed)
 * 2. Build a UserOp (to/value/data -> callData, gas estimation, paymaster)
 * 3. Compute UserOp hash
 * 4. Get WebAuthn assertion with UserOp hash as challenge
 * 5. Encode signature and submit UserOp to bundler
 * 6. Optionally wait for receipt
 */
export async function sendTransactionWithPasskey(opts: SendTransactionOptions): Promise<SendTransactionResult> {
  const {
    tx,
    credentialId,
    smartWalletAddress,
    publicKeySec1Hex,
    network,
    rpId,
    ownerIndex = 0n,
    waitForReceipt: shouldWait = true,
    timeoutMs,
    pollIntervalMs,
  } = opts

  const config = getChainConfig(network)
  const bundlerClient = createBundlerClient(config.bundlerUrl)

  // Check deployment status
  const deployed = await isSmartWalletDeployed(smartWalletAddress, { rpcUrl: config.rpcUrl })

  // Convert tx params to CallParams
  const txArray = Array.isArray(tx) ? tx : [tx]
  const calls: CallParams[] = txArray.map((t) => ({
    target: t.to,
    value: t.value ?? 0n,
    data: (t.data ?? "0x") as Hex,
  }))

  // Build the unsigned UserOp
  const userOp = await buildUserOperation({
    sender: smartWalletAddress,
    call: calls.length === 1 ? calls[0] : calls,
    publicKeySec1Hex,
    isDeployed: deployed,
    rpcUrl: config.rpcUrl,
    bundlerClient,
    entryPoint: ENTRYPOINT_V07_ADDRESS,
    paymasterUrl: config.paymasterUrl,
  })

  // Compute hash and sign with passkey
  const userOpHash = computeUserOpHash(userOp, ENTRYPOINT_V07_ADDRESS, config.chainId)
  userOp.signature = await signHashWithPasskeyPortable(userOpHash, credentialId, rpId, ownerIndex)

  // Submit to bundler
  const submittedHash = await submitUserOperation(bundlerClient, userOp, ENTRYPOINT_V07_ADDRESS)

  if (!shouldWait) {
    return { userOpHash: submittedHash }
  }

  // Wait for receipt
  const receipt = await waitForUserOperationReceipt({
    bundlerClient,
    userOpHash: submittedHash,
    timeoutMs,
    pollIntervalMs,
  })

  return {
    userOpHash: submittedHash,
    transactionHash: receipt.receipt.transactionHash,
  }
}
