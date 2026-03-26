/**
 * Flow transaction signing with passkeys — FLIP-264 compatible.
 */
import type { PasskeySignResult } from './types';
import { bytesToHex, hexToBytes } from './utils';
import { sha256, derToP256Raw, buildExtensionData, encodeMessageFromSignable } from './encode';
import { getPasskeyAssertion } from './webauthn';

export interface SignTransactionOptions {
  messageHex: string;
  credentialId: string;
  rpId: string;
}

export async function signFlowTransaction(options: SignTransactionOptions): Promise<PasskeySignResult> {
  const { messageHex, credentialId, rpId } = options;

  const challenge = sha256(hexToBytes(messageHex));

  const assertion = await getPasskeyAssertion({
    rpId,
    challenge,
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
  });

  const rawSig = derToP256Raw(assertion.signature);
  const signature = bytesToHex(rawSig);
  const extensionData = buildExtensionData(assertion.authenticatorData, assertion.clientDataJSON);

  return { signature, extensionData };
}

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
