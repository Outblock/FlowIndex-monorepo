import { describe, it, expect } from "vitest"
import { computeReplaySafeHash, derToRS, findChallengeIndex, findTypeIndex, encodeWebAuthnSignature } from "../src/signer"

describe("signer", () => {
  describe("derToRS", () => {
    it("extracts r and s from a DER-encoded P-256 signature", () => {
      const r32 = "0000000000000000000000000000000000000000000000000000000000000001"
      const s32 = "0000000000000000000000000000000000000000000000000000000000000002"
      const der = new Uint8Array(
        Array.from(Buffer.from("3044" + "0220" + r32 + "0220" + s32, "hex")),
      )
      const { r, s } = derToRS(der)
      expect(r).toBe(1n)
      expect(s).toBe(2n)
    })

    it("normalizes high-s signatures to low-s", () => {
      const n = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
      const highS = n - 2n
      const der = new Uint8Array(
        Array.from(Buffer.from(
          "3045" +
          "0220" + "0000000000000000000000000000000000000000000000000000000000000001" +
          "0221" + "00" + highS.toString(16).padStart(64, "0"),
          "hex",
        )),
      )
      const { s } = derToRS(der)
      expect(s).toBe(2n)
    })
  })

  describe("findChallengeIndex", () => {
    it("finds byte offset of challenge in clientDataJSON", () => {
      const clientDataJSON = '{"type":"webauthn.get","challenge":"dGVzdA","origin":"https://example.com"}'
      const idx = findChallengeIndex(clientDataJSON)
      const expected = clientDataJSON.indexOf('"challenge"')
      expect(idx).toBe(expected)
    })
  })

  describe("findTypeIndex", () => {
    it("finds byte offset of type in clientDataJSON", () => {
      const clientDataJSON = '{"type":"webauthn.get","challenge":"dGVzdA","origin":"https://example.com"}'
      const idx = findTypeIndex(clientDataJSON)
      const expected = clientDataJSON.indexOf('"type"')
      expect(idx).toBe(expected)
    })
  })

  describe("encodeWebAuthnSignature", () => {
    it("ABI-encodes SignatureWrapper struct", () => {
      const result = encodeWebAuthnSignature({
        ownerIndex: 0n,
        authenticatorData: new Uint8Array([0x01, 0x02]),
        clientDataJSON: '{"type":"webauthn.get","challenge":"dGVzdA"}',
        r: 1n,
        s: 2n,
      })
      expect(result).toMatch(/^0x[0-9a-f]+$/i)
      expect(result.length).toBeGreaterThan(200)
    })
  })

  describe("computeReplaySafeHash", () => {
    it("wraps a hash with the Coinbase Smart Wallet EIP-712 domain", () => {
      const result = computeReplaySafeHash(
        "0x" + "11".repeat(32),
        "0x1234567890123456789012345678901234567890",
        545,
      )
      expect(result).toMatch(/^0x[0-9a-f]{64}$/i)
    })
  })
})
