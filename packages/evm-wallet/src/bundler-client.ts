import type { Hex, Address } from "viem"

export interface PackedUserOperation {
  sender: Address
  nonce: Hex
  initCode: Hex
  callData: Hex
  accountGasLimits: Hex
  preVerificationGas: Hex
  gasFees: Hex
  paymasterAndData: Hex
  signature: Hex
}

export interface GasEstimate {
  preVerificationGas: Hex
  verificationGasLimit: Hex
  callGasLimit: Hex
}

export interface UserOpReceipt {
  userOpHash: Hex
  sender: Address
  nonce: Hex
  success: boolean
  actualGasCost: Hex
  actualGasUsed: Hex
  receipt: { transactionHash: Hex; blockNumber: Hex }
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0"
  id: number
  result?: T
  error?: { code: number; message: string }
}

function unpackGasLimits(accountGasLimits: Hex): { verificationGasLimit: Hex; callGasLimit: Hex } {
  const clean = accountGasLimits.startsWith("0x") ? accountGasLimits.slice(2) : accountGasLimits
  const padded = clean.padStart(64, "0")
  return {
    verificationGasLimit: `0x${padded.slice(0, 32)}` as Hex,
    callGasLimit: `0x${padded.slice(32, 64)}` as Hex,
  }
}

function unpackGasFees(gasFees: Hex): { maxPriorityFeePerGas: Hex; maxFeePerGas: Hex } {
  const clean = gasFees.startsWith("0x") ? gasFees.slice(2) : gasFees
  const padded = clean.padStart(64, "0")
  return {
    maxPriorityFeePerGas: `0x${padded.slice(0, 32)}` as Hex,
    maxFeePerGas: `0x${padded.slice(32, 64)}` as Hex,
  }
}

function splitInitCode(initCode?: Hex): { factory?: Address; factoryData?: Hex } {
  if (!initCode || initCode === "0x") return {}
  const clean = initCode.startsWith("0x") ? initCode.slice(2) : initCode
  if (clean.length < 40) {
    throw new Error("Invalid initCode: missing factory address")
  }
  return {
    factory: `0x${clean.slice(0, 40)}` as Address,
    factoryData: (`0x${clean.slice(40)}` || "0x") as Hex,
  }
}

function splitPaymasterAndData(paymasterAndData?: Hex): {
  paymaster?: Address
  paymasterVerificationGasLimit?: Hex
  paymasterPostOpGasLimit?: Hex
  paymasterData?: Hex
} {
  if (!paymasterAndData || paymasterAndData === "0x") return {}
  const clean = paymasterAndData.startsWith("0x") ? paymasterAndData.slice(2) : paymasterAndData
  if (clean.length < 104) {
    throw new Error("Invalid paymasterAndData: missing gas limits")
  }
  return {
    paymaster: `0x${clean.slice(0, 40)}` as Address,
    paymasterVerificationGasLimit: `0x${clean.slice(40, 72)}` as Hex,
    paymasterPostOpGasLimit: `0x${clean.slice(72, 104)}` as Hex,
    paymasterData: (`0x${clean.slice(104)}` || "0x") as Hex,
  }
}

function toBundlerRpcUserOp(userOp: Partial<PackedUserOperation> & Record<string, any>) {
  const rpcUserOp: Record<string, any> = {
    sender: userOp.sender,
    nonce: userOp.nonce,
    callData: userOp.callData,
    preVerificationGas: userOp.preVerificationGas,
    signature: userOp.signature ?? "0x",
  }

  if (userOp.callGasLimit !== undefined && userOp.verificationGasLimit !== undefined) {
    rpcUserOp.callGasLimit = userOp.callGasLimit
    rpcUserOp.verificationGasLimit = userOp.verificationGasLimit
  } else if (userOp.accountGasLimits) {
    Object.assign(rpcUserOp, unpackGasLimits(userOp.accountGasLimits))
  }

  if (userOp.maxFeePerGas !== undefined && userOp.maxPriorityFeePerGas !== undefined) {
    rpcUserOp.maxFeePerGas = userOp.maxFeePerGas
    rpcUserOp.maxPriorityFeePerGas = userOp.maxPriorityFeePerGas
  } else if (userOp.gasFees) {
    Object.assign(rpcUserOp, unpackGasFees(userOp.gasFees))
  }

  if (userOp.factory || userOp.factoryData) {
    rpcUserOp.factory = userOp.factory
    rpcUserOp.factoryData = userOp.factoryData
  } else {
    Object.assign(rpcUserOp, splitInitCode(userOp.initCode))
  }

  if (
    userOp.paymaster ||
    userOp.paymasterVerificationGasLimit ||
    userOp.paymasterPostOpGasLimit ||
    userOp.paymasterData
  ) {
    rpcUserOp.paymaster = userOp.paymaster
    rpcUserOp.paymasterVerificationGasLimit = userOp.paymasterVerificationGasLimit
    rpcUserOp.paymasterPostOpGasLimit = userOp.paymasterPostOpGasLimit
    rpcUserOp.paymasterData = userOp.paymasterData
  } else {
    Object.assign(rpcUserOp, splitPaymasterAndData(userOp.paymasterAndData))
  }

  return rpcUserOp
}

export function createBundlerClient(bundlerUrl: string) {
  let nextId = 1

  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(bundlerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    })
    const json: JsonRpcResponse<T> = await res.json()
    if (json.error) throw new Error(`Bundler RPC error: ${json.error.message}`)
    return json.result!
  }

  return {
    async sendUserOperation(userOp: PackedUserOperation, entryPoint: Address): Promise<Hex> {
      return rpc<Hex>("eth_sendUserOperation", [toBundlerRpcUserOp(userOp), entryPoint])
    },
    async estimateUserOperationGas(userOp: Partial<PackedUserOperation>, entryPoint: Address): Promise<GasEstimate> {
      return rpc<GasEstimate>("eth_estimateUserOperationGas", [toBundlerRpcUserOp(userOp), entryPoint])
    },
    async getUserOperationReceipt(userOpHash: Hex): Promise<UserOpReceipt | null> {
      return rpc<UserOpReceipt | null>("eth_getUserOperationReceipt", [userOpHash])
    },
    async supportedEntryPoints(): Promise<Address[]> {
      return rpc<Address[]>("eth_supportedEntryPoints", [])
    },
  }
}

export type BundlerClient = ReturnType<typeof createBundlerClient>
