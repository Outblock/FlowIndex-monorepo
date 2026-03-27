/**
 * Type declarations for @flowindex/flow-passkey (optional peer dependency).
 * Only the subset used by smart-wallet-signing.ts is declared here.
 */
declare module "@flowindex/flow-passkey" {
  export interface GetAssertionOptions {
    rpId: string
    challenge: Uint8Array
    allowCredentials?: Array<{ id: string; type: "public-key" }>
    mediation?: CredentialMediationRequirement
    signal?: AbortSignal
  }

  export interface PasskeyAssertionResult {
    credentialId: string
    authenticatorData: Uint8Array
    clientDataJSON: Uint8Array
    signature: Uint8Array
    rawId: Uint8Array
  }

  export function getPasskeyAssertion(options: GetAssertionOptions): Promise<PasskeyAssertionResult>
}
