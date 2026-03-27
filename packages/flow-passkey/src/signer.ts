/**
 * Flow transaction signing with passkeys — FLIP-264 compatible.
 */
import type { PasskeySignResult } from './types';
import { bytesToHex, hexToBytes } from './utils';
import { sha256, derToP256Raw, buildExtensionData, encodeMessageFromSignable } from './encode';
import { getPasskeyAssertion } from './webauthn';

/**
 * Options for signing a Flow transaction with a passkey.
 */
export interface SignTransactionOptions {
  /** Hex-encoded message to sign (from encodeMessageFromSignable). */
  messageHex: string;
  /** Base64url-encoded credential ID of the passkey to use. */
  credentialId: string;
  /** Relying party ID (domain) for the WebAuthn assertion. */
  rpId: string;
}

/**
 * Sign a Flow transaction using a passkey.
 *
 * 1. SHA-256 hashes the message bytes (FLIP-264: hash with account key's hashAlgo)
 * 2. Gets a WebAuthn assertion with the hash as challenge
 * 3. Converts the DER signature to raw P256 (r || s)
 * 4. Builds FLIP-264 extension data from authenticator/client data
 */
export async function signFlowTransaction(options: SignTransactionOptions): Promise<PasskeySignResult> {
  const { messageHex, credentialId, rpId } = options;

  // SHA-256 hash the message
  const challenge = sha256(hexToBytes(messageHex));

  // Get assertion via platform-adaptive WebAuthn
  const assertion = await getPasskeyAssertion({
    rpId,
    challenge,
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
  });

  // Convert DER signature to raw r||s (64 bytes)
  const rawSig = derToP256Raw(assertion.signature);
  const signature = bytesToHex(rawSig);

  // Build FLIP-264 extension data
  const extensionData = buildExtensionData(assertion.authenticatorData, assertion.clientDataJSON);

  return { signature, extensionData };
}

/**
 * Create an FCL-compatible authorization function using a passkey.
 */
export function createPasskeyAuthz(options: {
  address: string;
  keyIndex: number;
  credentialId: string;
  rpId: string;
}): (account: any) => any {
  const { address, keyIndex, credentialId, rpId } = options;
  const addr = address.replace(/^0x/, '');

  return (account: any) => ({
    ...account,
    addr,
    keyId: keyIndex,
    signingFunction: async (signable: any) => {
      const messageHex = encodeMessageFromSignable(signable, addr);
      const { signature, extensionData } = await signFlowTransaction({ messageHex, credentialId, rpId });
      return { addr, keyId: keyIndex, signature, extensionData };
    },
  });
}
