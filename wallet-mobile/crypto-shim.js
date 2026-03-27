/**
 * Minimal crypto polyfill for React Native.
 * Provides getRandomValues via expo-crypto, which is all WalletConnect needs.
 * This file is referenced in metro.config.js as the `crypto` module polyfill.
 */
const { getRandomValues } = require('expo-crypto');

module.exports = {
  getRandomValues,
  // WalletConnect also checks for subtle — provide a stub that throws on use
  subtle: new Proxy({}, {
    get() {
      throw new Error('crypto.subtle is not available in React Native. Use @noble/hashes instead.');
    },
  }),
  randomUUID: () => {
    const bytes = new Uint8Array(16);
    getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  },
};
