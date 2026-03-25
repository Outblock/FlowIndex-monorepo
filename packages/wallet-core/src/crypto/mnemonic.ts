import { generateMnemonic as _generate, validateMnemonic as _validate, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export function generateMnemonic(strength: 128 | 256 = 128): string {
  return _generate(wordlist, strength);
}

export function validateMnemonic(mnemonic: string): boolean {
  return _validate(mnemonic, wordlist);
}

export async function mnemonicToSeed(mnemonic: string, passphrase?: string): Promise<Uint8Array> {
  return mnemonicToSeedSync(mnemonic, passphrase ?? '');
}
