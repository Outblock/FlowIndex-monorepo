import { fcl } from './fclConfig';
import { signMessage } from '../auth/localKeyManager';

/**
 * Flow Emulator default service account.
 * These are public, well-known test values — NOT secrets.
 */
export const EMULATOR_SERVICE_ADDRESS = 'f8d6e0586b0a20c7';
export const EMULATOR_SERVICE_KEY = 'bf9db4706c2fdb9011ee7e170ccac492f05427b96ab41d8bf2d8c58443704b76';

/**
 * Build an FCL authorization function for the emulator service account.
 */
export function buildEmulatorAuthz(account: any) {
  return {
    ...account,
    tempId: `${EMULATOR_SERVICE_ADDRESS}-0`,
    addr: fcl.sansPrefix(EMULATOR_SERVICE_ADDRESS),
    keyId: 0,
    signingFunction: async (signable: { message: string }) => {
      const signature = await signMessage(
        EMULATOR_SERVICE_KEY,
        signable.message,
        'ECDSA_P256',
        'SHA3_256',
      );
      return {
        addr: fcl.withPrefix(EMULATOR_SERVICE_ADDRESS),
        keyId: 0,
        signature,
      };
    },
    signatureAlgorithm: 2,  // ECDSA_P256
    hashAlgorithm: 3,       // SHA3_256
  };
}
