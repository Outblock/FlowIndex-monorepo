/**
 * Flow transaction encoding + passkey signing helpers.
 * Ported from onflow/passkey-wallet-tech.
 */
import { SHA3 } from 'sha3';
import { encode as rlpEncode } from '@onflow/rlp';

// -- Hex / bytes helpers --

export const bytesToHex = (b: Uint8Array) =>
  Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');

export const hexToBytes = (hex: string) => {
  const clean = hex.replace(/^0x/, '');
  return new Uint8Array((clean.match(/.{1,2}/g) || []).map(b => parseInt(b, 16)));
};

const utf8ToBytes = (s: string) => new TextEncoder().encode(s);

const leftPadHex = (hex: string, byteLength: number) =>
  hex.replace(/^0x/, '').padStart(byteLength * 2, '0');

const rightPadHex = (hex: string, byteLength: number) =>
  hex.replace(/^0x/, '').padEnd(byteLength * 2, '0');

// -- Domain tags --

export const TRANSACTION_DOMAIN_TAG = rightPadHex(
  bytesToHex(utf8ToBytes('FLOW-V0.0-transaction')), 32
);

// -- SHA helpers --

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const buf = bytes.buffer instanceof ArrayBuffer
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    : new Uint8Array(bytes).slice().buffer;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return new Uint8Array(digest);
}

export function sha3_256(hex: string): string {
  const sha = new SHA3(256);
  sha.update(hexToBytes(hex.replace(/^0x/, '')));
  const out = sha.digest() as ArrayBuffer | Uint8Array;
  const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
  return bytesToHex(bytes);
}

// -- Voucher types --

export type Voucher = {
  cadence: string;
  refBlock: string;
  computeLimit: number;
  arguments: any[];
  proposalKey: { address: string; keyId: number; sequenceNum: number };
  payer: string;
  authorizers: string[];
  payloadSigs: { address: string; keyId: number; sig: string; extensionData?: string }[];
  envelopeSigs: { address: string; keyId: number; sig: string; extensionData?: string }[];
};

export type Signable = { voucher: Voucher; message?: string };

// -- RLP encoding --

const addressBytes = (addr: string) => hexToBytes(leftPadHex(addr, 8));
const blockBytes = (block: string) => hexToBytes(leftPadHex(block, 32));
const argBytes = (arg: any) => utf8ToBytes(JSON.stringify(arg));
const scriptBytes = (script: string) => utf8ToBytes(script);
const sigBytes = (sig: string) => hexToBytes(sig.replace(/^0x/, ''));

const collectSigners = (v: Voucher) => {
  const map = new Map<string, number>();
  let i = 0;
  const add = (a: string) => {
    const key = a.replace(/^0x/, '');
    if (!map.has(key)) map.set(key, i++);
  };
  if (v.proposalKey.address) add(v.proposalKey.address);
  add(v.payer);
  v.authorizers.forEach(add);
  return map;
};

const preparePayload = (v: Voucher) => [
  scriptBytes(v.cadence || ''),
  v.arguments.map(argBytes),
  blockBytes(v.refBlock || '0'),
  v.computeLimit,
  addressBytes(v.proposalKey.address.replace(/^0x/, '')),
  v.proposalKey.keyId,
  v.proposalKey.sequenceNum,
  addressBytes(v.payer.replace(/^0x/, '')),
  v.authorizers.map(a => addressBytes(a.replace(/^0x/, ''))),
];

const prepareSigs = (v: Voucher, sigs: Voucher['payloadSigs']) => {
  const signers = collectSigners(v);
  return sigs
    .map(s => ({
      signerIndex: signers.get(s.address.replace(/^0x/, '')) || 0,
      keyId: s.keyId,
      sig: s.sig,
    }))
    .sort((a, b) => a.signerIndex === b.signerIndex ? a.keyId - b.keyId : a.signerIndex - b.signerIndex)
    .map(s => [s.signerIndex, s.keyId, sigBytes(s.sig)]);
};

export const encodeTransactionPayload = (v: Voucher) =>
  TRANSACTION_DOMAIN_TAG + bytesToHex(rlpEncode(preparePayload(v)) as unknown as Uint8Array);

export const encodeTransactionEnvelope = (v: Voucher) =>
  TRANSACTION_DOMAIN_TAG + bytesToHex(
    rlpEncode([preparePayload(v), prepareSigs(v, v.payloadSigs)]) as unknown as Uint8Array
  );

export const encodeMessageFromSignable = (signable: Signable, signerAddress: string): string => {
  const withPrefix = (a: string) => a.startsWith('0x') ? a : '0x' + a;
  const payloadSet = new Set<string>([
    ...signable.voucher.authorizers.map(withPrefix),
    withPrefix(signable.voucher.proposalKey.address),
  ]);
  payloadSet.delete(withPrefix(signable.voucher.payer));
  const isPayload = payloadSet.has(withPrefix(signerAddress));
  return isPayload
    ? encodeTransactionPayload(signable.voucher)
    : encodeTransactionEnvelope(signable.voucher);
};

// -- DER to raw P256 signature --

export const derToP256Raw = (der: Uint8Array): Uint8Array => {
  let offset = 0;
  const readLen = (): number => {
    let len = der[offset++];
    if (len & 0x80) {
      const numBytes = len & 0x7f;
      len = 0;
      for (let i = 0; i < numBytes; i++) len = (len << 8) | der[offset++];
    }
    return len;
  };
  if (der[offset++] !== 0x30) throw new Error('Invalid DER: expected SEQUENCE');
  readLen();
  if (der[offset++] !== 0x02) throw new Error('Invalid DER: expected INTEGER r');
  const rLen = readLen();
  let r = der.slice(offset, offset + rLen);
  offset += rLen;
  if (der[offset++] !== 0x02) throw new Error('Invalid DER: expected INTEGER s');
  const sLen = readLen();
  let s = der.slice(offset, offset + sLen);
  if (r[0] === 0x00) r = r.slice(1);
  if (s[0] === 0x00) s = s.slice(1);
  const pad = (x: Uint8Array) =>
    x.length < 32 ? new Uint8Array([...new Uint8Array(32 - x.length).fill(0), ...x])
    : x.length > 32 ? x.slice(-32) : x;
  const out = new Uint8Array(64);
  out.set(pad(r), 0);
  out.set(pad(s), 32);
  return out;
};

// -- FLIP-264 extension data --

export function buildExtensionData(authenticatorData: Uint8Array, clientDataJSON: Uint8Array): string {
  const rlpEncoded = rlpEncode([authenticatorData, clientDataJSON]) as unknown as Uint8Array;
  const ext = new Uint8Array(1 + rlpEncoded.length);
  ext[0] = 0x01;
  ext.set(rlpEncoded instanceof Uint8Array ? rlpEncoded : new Uint8Array(rlpEncoded), 1);
  return bytesToHex(ext);
}
