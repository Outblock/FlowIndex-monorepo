/**
 * Native WebAuthn credential management via react-native-passkeys.
 * Same exports as webauthn.web.ts — Metro resolves this file on React Native.
 */
import { Passkeys } from 'react-native-passkeys';
import type { PasskeyCredentialResult, PasskeyAssertionResult } from './types';
import { bytesToHex, bytesToBase64Url, base64UrlToBytes } from './utils';

export interface CreatePasskeyOptions {
  rpId: string;
  rpName: string;
  challenge: Uint8Array;
  userId: Uint8Array;
  userName: string;
  excludeCredentials?: Array<{ id: string; type: 'public-key' }>;
}

export interface GetAssertionOptions {
  rpId: string;
  challenge: Uint8Array;
  allowCredentials?: Array<{ id: string; type: 'public-key' }>;
  mediation?: string;
  signal?: AbortSignal;
}

export async function createPasskeyCredential(options: CreatePasskeyOptions): Promise<PasskeyCredentialResult> {
  const { rpId, rpName, challenge, userId, userName, excludeCredentials } = options;

  const result = await Passkeys.create({
    rp: { id: rpId, name: rpName },
    user: {
      id: bytesToBase64Url(userId),
      name: userName,
      displayName: userName,
    },
    challenge: bytesToBase64Url(challenge),
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    attestation: 'none',
    excludeCredentials: excludeCredentials?.map(c => ({
      id: c.id,
      type: c.type,
    })),
  });

  let publicKeySec1Hex = '';
  if (result.response.publicKey) {
    const spkiBytes = base64UrlToBytes(result.response.publicKey);
    if (spkiBytes.length >= 65) {
      const sec1 = spkiBytes.slice(spkiBytes.length - 65);
      if (sec1[0] === 0x04) {
        publicKeySec1Hex = bytesToHex(sec1);
      }
    }
  }

  return {
    credentialId: result.id,
    attestationResponse: result.response as unknown as AuthenticatorAttestationResponse,
    rawId: base64UrlToBytes(result.rawId),
    type: result.type,
    publicKeySec1Hex,
  };
}

export async function getPasskeyAssertion(options: GetAssertionOptions): Promise<PasskeyAssertionResult> {
  const { rpId, challenge, allowCredentials } = options;

  const result = await Passkeys.get({
    rpId,
    challenge: bytesToBase64Url(challenge),
    userVerification: 'preferred',
    allowCredentials: allowCredentials?.map(c => ({
      id: c.id,
      type: c.type,
    })),
  });

  return {
    credentialId: result.id,
    authenticatorData: base64UrlToBytes(result.response.authenticatorData),
    clientDataJSON: base64UrlToBytes(result.response.clientDataJSON),
    signature: base64UrlToBytes(result.response.signature),
    rawId: base64UrlToBytes(result.rawId),
  };
}
