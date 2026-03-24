import { describe, it, expect, vi, beforeEach } from "vitest"

const {
  mockIsSmartWalletDeployed,
  mockSendSmartWalletTransaction,
  mockDeploySmartWallet,
  mockSignMessageWithPasskey,
  mockSignTypedDataWithPasskey,
} = vi.hoisted(() => ({
  mockIsSmartWalletDeployed: vi.fn(),
  mockSendSmartWalletTransaction: vi.fn(),
  mockDeploySmartWallet: vi.fn(),
  mockSignMessageWithPasskey: vi.fn(),
  mockSignTypedDataWithPasskey: vi.fn(),
}))

vi.mock("../src/factory", async () => {
  const actual = await vi.importActual<typeof import("../src/factory")>("../src/factory")
  return {
    ...actual,
    isSmartWalletDeployed: mockIsSmartWalletDeployed,
  }
})

vi.mock("../src/user-op", async () => {
  const actual = await vi.importActual<typeof import("../src/user-op")>("../src/user-op")
  return {
    ...actual,
    sendSmartWalletTransaction: mockSendSmartWalletTransaction,
    deploySmartWallet: mockDeploySmartWallet,
  }
})

vi.mock("../src/signer", async () => {
  const actual = await vi.importActual<typeof import("../src/signer")>("../src/signer")
  return {
    ...actual,
    signMessageWithPasskey: mockSignMessageWithPasskey,
    signTypedDataWithPasskey: mockSignTypedDataWithPasskey,
  }
})

import { createEvmWalletProvider } from "../src/provider"

describe("provider", () => {
  let provider: ReturnType<typeof createEvmWalletProvider>

  beforeEach(() => {
    mockIsSmartWalletDeployed.mockReset()
    mockSendSmartWalletTransaction.mockReset()
    mockDeploySmartWallet.mockReset()
    mockSignMessageWithPasskey.mockReset()
    mockSignTypedDataWithPasskey.mockReset()
    mockIsSmartWalletDeployed.mockResolvedValue(true)

    provider = createEvmWalletProvider({
      smartWalletAddress: "0xabc123" as any,
      rpcUrl: "https://mainnet.evm.nodes.onflow.org",
      bundlerUrl: "http://localhost:4337",
      publicKeySec1Hex: "04" + "00".repeat(64),
      credentialId: "test-cred",
      isDeployed: true,
    })
  })

  it("returns chain ID for eth_chainId", async () => {
    const result = await provider.request({ method: "eth_chainId" })
    expect(result).toBe("0x2eb")
  })

  it("returns smart wallet address for eth_accounts", async () => {
    const result = await provider.request({ method: "eth_accounts" })
    expect(result).toEqual(["0xabc123"])
  })

  it("returns smart wallet address for eth_requestAccounts", async () => {
    const result = await provider.request({ method: "eth_requestAccounts" })
    expect(result).toEqual(["0xabc123"])
  })

  it("rejects wallet_switchEthereumChain", async () => {
    await expect(
      provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] }),
    ).rejects.toThrow("Chain switching not supported")
  })

  it("routes eth_sendTransaction through the smart wallet tx flow", async () => {
    mockSendSmartWalletTransaction.mockResolvedValue({
      userOpHash: "0xuserop",
      transactionHash: "0xtxhash",
    })

    const result = await provider.request({
      method: "eth_sendTransaction",
      params: [{ to: "0x1234567890123456789012345678901234567890", value: "0x1", data: "0xdeadbeef" }],
    })

    expect(result).toBe("0xtxhash")
    expect(mockSendSmartWalletTransaction).toHaveBeenCalledTimes(1)
    expect(mockSendSmartWalletTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        sender: "0xabc123",
        credentialId: "test-cred",
        isDeployed: true,
        chainId: 747,
      }),
    )
  })

  it("auto-deploys before personal_sign and signs the message", async () => {
    mockIsSmartWalletDeployed.mockResolvedValue(false)
    mockDeploySmartWallet.mockResolvedValue({ userOpHash: "0xdeploy", transactionHash: "0xdeployed" })
    mockSignMessageWithPasskey.mockResolvedValue("0xsigned-message")

    const undeployedProvider = createEvmWalletProvider({
      smartWalletAddress: "0xabc123" as any,
      rpcUrl: "https://mainnet.evm.nodes.onflow.org",
      bundlerUrl: "http://localhost:4337",
      publicKeySec1Hex: "04" + "00".repeat(64),
      credentialId: "test-cred",
      isDeployed: false,
    })

    const result = await undeployedProvider.request({
      method: "personal_sign",
      params: ["Hello, Flow EVM!", "0xabc123"],
    })

    expect(result).toBe("0xsigned-message")
    expect(mockDeploySmartWallet).toHaveBeenCalledTimes(1)
    expect(mockSignMessageWithPasskey).toHaveBeenCalledWith(
      "Hello, Flow EVM!",
      "test-cred",
      "0xabc123",
      747,
    )
  })

  it("signs typed data v4 and parses JSON payloads", async () => {
    mockSignTypedDataWithPasskey.mockResolvedValue("0xtyped-data-signature")

    const typedData = JSON.stringify({
      domain: {
        name: "Demo",
        version: "1",
        chainId: 747,
        verifyingContract: "0x1234567890123456789012345678901234567890",
      },
      primaryType: "Mail",
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        Mail: [{ name: "contents", type: "string" }],
      },
      message: { contents: "Hello" },
    })

    const result = await provider.request({
      method: "eth_signTypedData_v4",
      params: ["0xabc123", typedData],
    })

    expect(result).toBe("0xtyped-data-signature")
    expect(mockSignTypedDataWithPasskey).toHaveBeenCalledWith(
      expect.objectContaining({ primaryType: "Mail" }),
      "test-cred",
      "0xabc123",
      747,
    )
  })

  it("supports event listeners", () => {
    const handler = vi.fn()
    provider.on("accountsChanged", handler)
    provider.removeListener("accountsChanged", handler)
  })
})
