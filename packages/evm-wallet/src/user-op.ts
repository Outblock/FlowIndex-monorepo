import {
  type Address,
  type Hex,
  type Hash,
  encodeFunctionData,
  pad,
  concat,
  toHex,
  createPublicClient,
  http,
} from "viem"
import { computeUserOpHash, SMART_WALLET_ABI, ENTRYPOINT_ABI, ENTRYPOINT_V07_ADDRESS } from "./constants"
import { buildInitCode } from "./factory"
import { WEBAUTHN_STUB_SIGNATURE, signUserOpWithPasskey } from "./signer"
import type { BundlerClient, PackedUserOperation, UserOpReceipt } from "./bundler-client"

export interface CallParams {
  target: Address
  value: bigint
  data: Hex
}

/**
 * Pack verificationGasLimit and callGasLimit into bytes32.
 * Format: uint128(verificationGasLimit) || uint128(callGasLimit)
 */
export function packGasLimits(verificationGasLimit: bigint, callGasLimit: bigint): Hex {
  const vgl = pad(toHex(verificationGasLimit), { size: 16 })
  const cgl = pad(toHex(callGasLimit), { size: 16 })
  return concat([vgl, cgl])
}

/**
 * Pack maxPriorityFeePerGas and maxFeePerGas into bytes32.
 * Format: uint128(maxPriorityFeePerGas) || uint128(maxFeePerGas)
 */
export function packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): Hex {
  const mpfpg = pad(toHex(maxPriorityFeePerGas), { size: 16 })
  const mfpg = pad(toHex(maxFeePerGas), { size: 16 })
  return concat([mpfpg, mfpg])
}

/**
 * Encode callData for CoinbaseSmartWallet.execute()
 */
export function buildCallData(call: CallParams): Hex {
  return encodeFunctionData({
    abi: SMART_WALLET_ABI,
    functionName: "execute",
    args: [call.target, call.value, call.data],
  })
}

/**
 * Encode callData for CoinbaseSmartWallet.executeBatch()
 */
export function buildBatchCallData(calls: CallParams[]): Hex {
  return encodeFunctionData({
    abi: SMART_WALLET_ABI,
    functionName: "executeBatch",
    args: [calls],
  })
}

async function requestPaymasterAndData(
  paymasterUrl: string | undefined,
  userOp: {
    sender: Address
    nonce: Hex
    initCode: Hex
    callData: Hex
    accountGasLimits: Hex
    preVerificationGas: Hex
    gasFees: Hex
    signature: Hex
  },
): Promise<Hex> {
  if (!paymasterUrl) return "0x"

  const response = await fetch(paymasterUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userOp: { ...userOp, paymasterAndData: "0x" } }),
  })
  const data = await response.json()
  return (data.paymasterAndData ?? "0x") as Hex
}

/**
 * Build a complete unsigned UserOperation (v0.7 packed format).
 */
export async function buildUserOperation(opts: {
  sender: Address
  call: CallParams | CallParams[]
  publicKeySec1Hex: string
  isDeployed: boolean
  rpcUrl: string
  bundlerClient: BundlerClient
  entryPoint?: Address
  paymasterUrl?: string
}): Promise<PackedUserOperation> {
  const {
    sender,
    call,
    publicKeySec1Hex,
    isDeployed,
    rpcUrl,
    bundlerClient,
    entryPoint = ENTRYPOINT_V07_ADDRESS,
  } = opts

  const client = createPublicClient({ transport: http(rpcUrl) })

  const nonce = await client.readContract({
    address: entryPoint,
    abi: ENTRYPOINT_ABI,
    functionName: "getNonce",
    args: [sender, 0n],
  })

  const initCode: Hex = isDeployed ? "0x" : buildInitCode(publicKeySec1Hex)
  const callData = Array.isArray(call) ? buildBatchCallData(call) : buildCallData(call)

  const block = await client.getBlock()
  const baseFee = block.baseFeePerGas ?? 1n
  const maxFeePerGas = baseFee * 2n > 1000000n ? baseFee * 2n : 1000000n
  const maxPriorityFeePerGas = 0n
  const initialAccountGasLimits = packGasLimits(500000n, 500000n)
  const initialPreVerificationGas = toHex(100000n)
  const gasFees = packGasFees(maxPriorityFeePerGas, maxFeePerGas)

  const preliminaryPaymasterAndData = await requestPaymasterAndData(opts.paymasterUrl, {
    sender,
    nonce: toHex(nonce),
    initCode,
    callData,
    accountGasLimits: initialAccountGasLimits,
    preVerificationGas: initialPreVerificationGas,
    gasFees,
    signature: WEBAUTHN_STUB_SIGNATURE,
  })

  const gasEstimate = await bundlerClient.estimateUserOperationGas(
    {
      sender,
      nonce: toHex(nonce),
      initCode,
      callData,
      signature: WEBAUTHN_STUB_SIGNATURE,
      paymasterAndData: preliminaryPaymasterAndData,
      callGasLimit: toHex(500000n),
      verificationGasLimit: toHex(500000n),
      preVerificationGas: initialPreVerificationGas,
      maxFeePerGas: toHex(maxFeePerGas),
      maxPriorityFeePerGas: toHex(maxPriorityFeePerGas),
    },
    entryPoint,
  )

  const accountGasLimits = packGasLimits(
    BigInt(gasEstimate.verificationGasLimit),
    BigInt(gasEstimate.callGasLimit),
  )
  const preVerificationGas = gasEstimate.preVerificationGas as Hex
  const paymasterAndData = await requestPaymasterAndData(opts.paymasterUrl, {
    sender,
    nonce: toHex(nonce),
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
    signature: WEBAUTHN_STUB_SIGNATURE,
  })

  const result: PackedUserOperation = {
    sender,
    nonce: toHex(nonce),
    initCode,
    callData,
    accountGasLimits,
    preVerificationGas,
    gasFees,
    paymasterAndData,
    signature: "0x",
  }

  return result
}

export async function submitUserOperation(
  bundlerClient: BundlerClient,
  userOp: PackedUserOperation,
  entryPoint: Address = ENTRYPOINT_V07_ADDRESS,
): Promise<Hash> {
  return bundlerClient.sendUserOperation(userOp, entryPoint)
}

export async function waitForUserOperationReceipt(opts: {
  bundlerClient: BundlerClient
  userOpHash: Hash
  timeoutMs?: number
  pollIntervalMs?: number
}): Promise<UserOpReceipt> {
  const { bundlerClient, userOpHash, timeoutMs = 60000, pollIntervalMs = 2000 } = opts
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const receipt = await bundlerClient.getUserOperationReceipt(userOpHash)
    if (receipt) return receipt
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(`UserOp ${userOpHash} not mined within ${timeoutMs}ms`)
}

export async function sendSmartWalletTransaction(opts: {
  sender: Address
  call: CallParams | CallParams[]
  publicKeySec1Hex: string
  credentialId: string
  isDeployed: boolean
  rpcUrl: string
  bundlerClient: BundlerClient
  chainId: number
  entryPoint?: Address
  paymasterUrl?: string
  waitForReceipt?: boolean
  timeoutMs?: number
  pollIntervalMs?: number
}): Promise<{ userOpHash: Hash; transactionHash?: Hash; receipt?: UserOpReceipt }> {
  const {
    sender,
    call,
    publicKeySec1Hex,
    credentialId,
    isDeployed,
    rpcUrl,
    bundlerClient,
    chainId,
    entryPoint = ENTRYPOINT_V07_ADDRESS,
    paymasterUrl,
    waitForReceipt = true,
    timeoutMs,
    pollIntervalMs,
  } = opts

  const userOp = await buildUserOperation({
    sender,
    call,
    publicKeySec1Hex,
    isDeployed,
    rpcUrl,
    bundlerClient,
    entryPoint,
    paymasterUrl,
  })

  const userOpHash = computeUserOpHash(userOp, entryPoint, chainId)
  userOp.signature = await signUserOpWithPasskey(userOpHash, credentialId)

  const submittedUserOpHash = await submitUserOperation(bundlerClient, userOp, entryPoint)

  if (!waitForReceipt) {
    return { userOpHash: submittedUserOpHash }
  }

  const receipt = await waitForUserOperationReceipt({
    bundlerClient,
    userOpHash: submittedUserOpHash,
    timeoutMs,
    pollIntervalMs,
  })

  return {
    userOpHash: submittedUserOpHash,
    transactionHash: receipt.receipt.transactionHash,
    receipt,
  }
}

export async function deploySmartWallet(opts: {
  sender: Address
  publicKeySec1Hex: string
  credentialId: string
  rpcUrl: string
  bundlerClient: BundlerClient
  chainId: number
  entryPoint?: Address
  paymasterUrl?: string
  timeoutMs?: number
  pollIntervalMs?: number
}): Promise<{ userOpHash: Hash; transactionHash?: Hash; receipt?: UserOpReceipt }> {
  return sendSmartWalletTransaction({
    ...opts,
    call: [],
    isDeployed: false,
  })
}
