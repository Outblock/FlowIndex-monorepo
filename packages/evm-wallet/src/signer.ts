import { type Address, type Hex, concat, encodeAbiParameters, hashMessage, hashTypedData, keccak256, toHex } from "viem"

// Viem's official WebAuthn stub signature for CoinbaseSmartWallet gas estimation.
// This is a properly ABI-encoded SignatureWrapper(tuple) carrying a WebAuthnAuth(tuple).
export const WEBAUTHN_STUB_SIGNATURE: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000040" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "00000000000000000000000000000000000000000000000000000000000000c0" +
  "0000000000000000000000000000000000000000000000000000000000000120" +
  "0000000000000000000000000000000000000000000000000000000000000017" +
  "0000000000000000000000000000000000000000000000000000000000000019" +
  "49fc7c88032b9fcb5f6efc7a7b8c63668eae9871b765e23123bb473ff57aa831" +
  "a7c0d9276168ebcc29f2875a0239cffdf2a9cd1c2007c5c77c071db9264df1d0" +
  "0000000000000000000000000000000000000000000000000000000000000025" +
  "49960de5880e8c687434170f6476605b8fe4aeb9a28632c7995cf3ba831d9763" +
  "0500000000000000000000000000000000000000000000000000000000000000" +
  "000000000000000000000000000000000000000000000000000000000000008a" +
  "7b2274797065223a22776562617574686e2e676574222c226368616c6c656e67" +
  "65223a2273496a396e6164474850596755334b7556384f7a4a666c726275504b" +
  "474f716d59576f4d57516869467773222c226f726967696e223a226874747073" +
  "3a2f2f7369676e2e636f696e626173652e636f6d222c2263726f73734f726967" +
  "696e223a66616c73657d00000000000000000000000000000000000000000000" as Hex

export function derToRS(der: Uint8Array): { r: bigint; s: bigint } {
  const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
  let offset = 2
  if (der[offset] !== 0x02) throw new Error("Expected 0x02 tag for r")
  offset++
  const rLen = der[offset]
  offset++
  const rBytes = der.slice(offset, offset + rLen)
  offset += rLen
  if (der[offset] !== 0x02) throw new Error("Expected 0x02 tag for s")
  offset++
  const sLen = der[offset]
  offset++
  const sBytes = der.slice(offset, offset + sLen)

  const toHexStr = (bytes: Uint8Array) =>
    Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")
  const r = BigInt("0x" + toHexStr(rBytes))
  let s = BigInt("0x" + toHexStr(sBytes))
  if (s > P256_N / 2n) s = P256_N - s
  return { r, s }
}

export function findChallengeIndex(clientDataJSON: string): number {
  const idx = clientDataJSON.indexOf('"challenge"')
  if (idx === -1) throw new Error("challenge not found in clientDataJSON")
  return idx
}

export function findTypeIndex(clientDataJSON: string): number {
  const idx = clientDataJSON.indexOf('"type"')
  if (idx === -1) throw new Error("type not found in clientDataJSON")
  return idx
}

export function encodeSignatureWrapper(ownerIndex: bigint, signatureData: Hex): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "ownerIndex", type: "uint256" },
          { name: "signatureData", type: "bytes" },
        ],
      },
    ],
    [{ ownerIndex, signatureData }],
  )
}

export function encodeWebAuthnSignature(params: {
  ownerIndex: bigint
  authenticatorData: Uint8Array
  clientDataJSON: string
  r: bigint
  s: bigint
}): Hex {
  const { ownerIndex, authenticatorData, clientDataJSON, r, s } = params
  const challengeIndex = BigInt(findChallengeIndex(clientDataJSON))
  const typeIndex = BigInt(findTypeIndex(clientDataJSON))

  const signatureData = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "authenticatorData", type: "bytes" },
          { name: "clientDataJSON", type: "string" },
          { name: "challengeIndex", type: "uint256" },
          { name: "typeIndex", type: "uint256" },
          { name: "r", type: "uint256" },
          { name: "s", type: "uint256" },
        ],
      },
    ],
    [{
      authenticatorData: toHex(authenticatorData),
      clientDataJSON,
      challengeIndex,
      typeIndex,
      r,
      s,
    }],
  )

  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "ownerIndex", type: "uint256" },
          { name: "signatureData", type: "bytes" },
        ],
      },
    ],
    [{ ownerIndex, signatureData }],
  )
}

export async function signUserOpWithPasskey(
  userOpHash: Hex,
  credentialId: string,
  ownerIndex = 0n,
): Promise<Hex> {
  return signHashWithPasskey(userOpHash, credentialId, ownerIndex)
}

export function computeReplaySafeHash(hash: Hex, account: Address, chainId: number): Hex {
  const domainSeparator = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        keccak256(toHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")),
        keccak256(toHex("Coinbase Smart Wallet")),
        keccak256(toHex("1")),
        BigInt(chainId),
        account,
      ],
    ),
  )

  const messageTypeHash = keccak256(toHex("CoinbaseSmartWalletMessage(bytes32 hash)"))
  const hashStruct = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }],
      [messageTypeHash, hash],
    ),
  )

  return keccak256(concat(["0x1901", domainSeparator, hashStruct]))
}

export async function signMessageWithPasskey(
  message: string | Hex,
  credentialId: string,
  smartWalletAddress: Address,
  chainId: number,
  ownerIndex = 0n,
): Promise<Hex> {
  const messageHash = hashMessage(
    typeof message === "string" && message.startsWith("0x")
      ? { raw: message as Hex }
      : message,
  )
  const replaySafeHash = computeReplaySafeHash(messageHash, smartWalletAddress, chainId)
  return signHashWithPasskey(replaySafeHash, credentialId, ownerIndex)
}

export async function signTypedDataWithPasskey(
  typedData: any,
  credentialId: string,
  smartWalletAddress: Address,
  chainId: number,
  ownerIndex = 0n,
): Promise<Hex> {
  const typedDataHash = hashTypedData(typedData)
  const replaySafeHash = computeReplaySafeHash(typedDataHash, smartWalletAddress, chainId)
  return signHashWithPasskey(replaySafeHash, credentialId, ownerIndex)
}

export async function signHashWithPasskey(
  hash: Hex,
  credentialId: string,
  ownerIndex = 0n,
): Promise<Hex> {
  const challengeBytes = new Uint8Array(
    (hash.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
  )

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes,
      allowCredentials: [{ id: base64urlToBytes(credentialId) as BufferSource, type: "public-key" as const }],
      userVerification: "preferred",
    },
  })) as PublicKeyCredential

  const response = assertion.response as AuthenticatorAssertionResponse
  const authenticatorData = new Uint8Array(response.authenticatorData)
  const clientDataJSON = new TextDecoder().decode(response.clientDataJSON)
  const signature = new Uint8Array(response.signature)
  const { r, s } = derToRS(signature)

  return encodeWebAuthnSignature({ ownerIndex, authenticatorData, clientDataJSON, r, s })
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}
