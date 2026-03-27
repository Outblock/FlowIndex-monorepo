/**
 * Default webauthn — re-exports the web implementation.
 * Metro overrides this with webauthn.native.ts on React Native.
 */
export { createPasskeyCredential, getPasskeyAssertion } from './webauthn.web';
export type { CreatePasskeyOptions, GetAssertionOptions } from './webauthn.web';
