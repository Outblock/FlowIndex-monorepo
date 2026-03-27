/**
 * WebAuthn re-export for TypeScript type resolution.
 * At runtime, tsup/esbuild resolves to webauthn.web.ts (web) or
 * Metro resolves to webauthn.native.ts (React Native).
 */
export { createPasskeyCredential, getPasskeyAssertion } from './webauthn.web';
export type { CreatePasskeyOptions, GetAssertionOptions } from './webauthn.web';
