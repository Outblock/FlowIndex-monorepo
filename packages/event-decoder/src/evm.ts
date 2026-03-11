// ── EVM event decoding (ported from frontend/app/lib/deriveFromEvents.ts) ──

import { parseCadenceEventFields, formatAddr } from './cadence.js';
import type { RawEvent, EVMExecution, DecodedEVMCall, EVMLogTransfer } from './types.js';

/**
 * Decode a Flow EVM "direct call" raw_tx_payload (0xff-prefixed RLP).
 * Format: 0xff || RLP([nonce, subType, from(20B), to(20B), data, value, gasLimit, ...])
 */
export function decodeDirectCallPayload(
  hexPayload: string,
): { from: string; to: string; value: string; data: string } | null {
  try {
    let hex = hexPayload.replace(/^0x/, '').toLowerCase();
    if (!hex.startsWith('ff') || hex.length < 10) return null;
    hex = hex.slice(2);
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    let pos = 0;

    // Skip RLP list header
    if (bytes[pos] >= 0xf8) {
      pos += 1 + (bytes[pos] - 0xf7);
    } else if (bytes[pos] >= 0xc0) {
      pos += 1;
    } else {
      return null;
    }

    function readItem(): Uint8Array {
      if (pos >= bytes.length) return new Uint8Array(0);
      const b = bytes[pos];
      if (b <= 0x7f) {
        pos++;
        return new Uint8Array([b]);
      }
      if (b <= 0xb7) {
        const len = b - 0x80;
        pos++;
        const out = bytes.slice(pos, pos + len);
        pos += len;
        return out;
      }
      if (b <= 0xbf) {
        const ll = b - 0xb7;
        pos++;
        let len = 0;
        for (let i = 0; i < ll; i++) len = (len << 8) | bytes[pos + i];
        pos += ll;
        const out = bytes.slice(pos, pos + len);
        pos += len;
        return out;
      }
      return new Uint8Array(0);
    }

    const toHex = (b: Uint8Array) =>
      Array.from(b)
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');

    readItem(); // nonce
    readItem(); // subType
    const fromBytes = readItem(); // from (20 bytes)
    const toBytes = readItem(); // to (20 bytes)
    const dataBytes = readItem(); // data (EVM call data)
    const valueBytes = readItem(); // value

    const from = fromBytes.length === 20 ? '0x' + toHex(fromBytes) : '';
    const toH = toHex(toBytes);
    const to = toBytes.length === 20 && !/^0{40}$/.test(toH) ? '0x' + toH : '';
    const data = toHex(dataBytes);

    let value = '0';
    if (valueBytes.length > 0) {
      let n = BigInt(0);
      for (const byte of valueBytes) n = (n << BigInt(8)) | BigInt(byte);
      value = n.toString();
    }

    return { from, to, value, data };
  } catch {
    return null;
  }
}

/** Try to extract raw tx payload hex from parsed Cadence event fields */
function extractPayloadHex(fields: Record<string, any>): string {
  for (const key of ['payload', 'transaction', 'tx', 'txPayload', 'transactionPayload']) {
    if (key in fields && fields[key] != null) {
      const v = fields[key];
      if (typeof v === 'string') return v;
      // byte array as number array -> hex
      if (Array.isArray(v) && v.length > 0) {
        return (
          '0x' +
          v.map((b: any) => (Number(b) & 0xff).toString(16).padStart(2, '0')).join('')
        );
      }
    }
  }
  return '';
}

/** Extract EVM tx hash from various field names */
function extractEVMHash(payload: Record<string, any>): string {
  for (const key of ['hash', 'transactionHash', 'txHash', 'evmHash']) {
    if (key in payload) {
      const h = normalizeHexValue(payload[key]);
      if (h) return h;
    }
  }
  return '';
}

/** Normalize a string or byte array to lowercase hex (no 0x prefix) */
export function normalizeHexValue(value: any): string {
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase().replace(/^0x/, '');
    return /^[0-9a-f]+$/.test(s) ? s : '';
  }
  if (Array.isArray(value)) {
    const hex = value
      .map((b: any) => {
        const n = Number(b);
        return isNaN(n) ? '' : n.toString(16).padStart(2, '0');
      })
      .join('');
    return hex || '';
  }
  return '';
}

/** Try multiple field names for a hex value */
function extractHexField(payload: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    if (key in payload) {
      const h = normalizeHexValue(payload[key]);
      if (h) return h;
    }
  }
  return '';
}

/** Try multiple field names for a string value */
function extractStringField(payload: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    if (key in payload && payload[key] != null) {
      return String(payload[key]);
    }
  }
  return '';
}

/** Try multiple field names for a numeric value (returned as string) */
function extractNumField(payload: Record<string, any>, ...keys: string[]): string {
  for (const key of keys) {
    if (key in payload && payload[key] != null) {
      return String(payload[key]);
    }
  }
  return '0';
}

/** Parse a single raw EVM.TransactionExecuted event into an EVMExecution */
function parseEVMExecution(event: RawEvent): EVMExecution | null {
  const payload =
    typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
  const fields = parseCadenceEventFields(payload) || payload;
  if (!fields) return null;

  const hash = extractEVMHash(fields);
  if (!hash) return null;

  let from = formatAddr(extractHexField(fields, 'from', 'fromAddress', 'sender'));
  let to = formatAddr(extractHexField(fields, 'to', 'toAddress', 'recipient'));
  let value = extractStringField(fields, 'value') || '0';

  // Extract raw call data for ERC-20/721/1155 decoding
  let callData = extractHexField(fields, 'data', 'callData', 'input');

  // For Flow direct calls (0xff prefix), from/to/data aren't in top-level event fields --
  // they're only in the raw transaction payload bytes. Decode from there.
  if (!from || !to || !callData) {
    const payloadHex = extractPayloadHex(fields);
    if (payloadHex) {
      const decoded = decodeDirectCallPayload(payloadHex);
      if (decoded) {
        if (!from && decoded.from) from = decoded.from;
        if (!to && decoded.to) to = decoded.to;
        if (value === '0' && decoded.value !== '0') value = decoded.value;
        if (!callData && decoded.data) callData = decoded.data;
      }
    }
  }

  return {
    hash: '0x' + hash,
    from,
    to,
    gas_used: extractNumField(fields, 'gasConsumed', 'gasUsed', 'gas_used'),
    gas_limit: extractNumField(fields, 'gasLimit', 'gas', 'gas_limit'),
    gas_price: extractStringField(fields, 'gasPrice', 'gas_price') || '0',
    value,
    status: 'SEALED',
    event_index: event.event_index ?? 0,
    block_number: event.block_height,
    type: Number(extractStringField(fields, 'transactionType', 'txType') || '0'),
    position: Number(extractStringField(fields, 'index', 'position') || '0'),
    data: callData || undefined,
  };
}

// ── EVM call data decoding (ERC-20/721/1155 selectors) ──

const SEL_ERC20_TRANSFER = 'a9059cbb';       // transfer(address,uint256)
const SEL_ERC20_TRANSFER_FROM = '23b872dd';   // transferFrom(address,address,uint256)
const SEL_ERC721_SAFE_TRANSFER_3 = '42842e0e'; // safeTransferFrom(address,address,uint256)
const SEL_ERC721_SAFE_TRANSFER_4 = 'b88d4fde'; // safeTransferFrom(address,address,uint256,bytes)
const SEL_ERC1155_SAFE_TRANSFER = 'f242432a';  // safeTransferFrom(address,address,uint256,uint256,bytes)
const SEL_ERC1155_BATCH_TRANSFER = '2eb2c2d6'; // safeBatchTransferFrom(...)

function extractABIAddress(paramsHex: string, wordIndex: number): string {
  const start = wordIndex * 64;
  const end = start + 64;
  if (paramsHex.length < end) return '';
  const word = paramsHex.slice(start, end);
  const addrHex = word.slice(24, 64);
  if (/^0{40}$/.test(addrHex)) return '';
  return addrHex;
}

function extractABIUint256(paramsHex: string, wordIndex: number): string {
  const start = wordIndex * 64;
  const end = start + 64;
  if (paramsHex.length < end) return '';
  const word = paramsHex.slice(start, end);
  const val = BigInt('0x' + word);
  return val.toString();
}

/** Decode EVM call data to extract recipient, tokenID, and call type */
export function decodeEVMCallData(dataHex: string): DecodedEVMCall {
  const data = dataHex.toLowerCase().replace(/^0x/, '');
  if (data.length < 8) return { recipient: '', tokenID: '', callType: 'unknown' };

  const selector = data.slice(0, 8);
  const params = data.slice(8);

  switch (selector) {
    case SEL_ERC20_TRANSFER: {
      const addr = extractABIAddress(params, 0);
      if (addr) return { recipient: addr, tokenID: '', callType: 'erc20_transfer' };
      break;
    }
    case SEL_ERC20_TRANSFER_FROM: {
      const addr = extractABIAddress(params, 1);
      if (addr) {
        const tid = extractABIUint256(params, 2);
        return { recipient: addr, tokenID: tid, callType: 'erc20_transferFrom' };
      }
      break;
    }
    case SEL_ERC721_SAFE_TRANSFER_3:
    case SEL_ERC721_SAFE_TRANSFER_4: {
      const addr = extractABIAddress(params, 1);
      if (addr) {
        const tid = extractABIUint256(params, 2);
        return { recipient: addr, tokenID: tid, callType: 'erc721_safeTransferFrom' };
      }
      break;
    }
    case SEL_ERC1155_SAFE_TRANSFER: {
      const addr = extractABIAddress(params, 1);
      if (addr) {
        const tid = extractABIUint256(params, 2);
        return { recipient: addr, tokenID: tid, callType: 'erc1155_safeTransferFrom' };
      }
      break;
    }
    case SEL_ERC1155_BATCH_TRANSFER: {
      const addr = extractABIAddress(params, 1);
      if (addr) return { recipient: addr, tokenID: '', callType: 'erc1155_safeBatchTransferFrom' };
      break;
    }
  }

  return { recipient: '', tokenID: '', callType: 'unknown' };
}

/**
 * Filter events for EVM.TransactionExecuted and parse each into EVMExecution.
 */
export function parseEVMEvents(events: RawEvent[]): EVMExecution[] {
  const results: EVMExecution[] = [];
  for (const event of events) {
    if (!event.type.includes('EVM.TransactionExecuted')) continue;
    const execution = parseEVMExecution(event);
    if (execution) results.push(execution);
  }
  return results;
}

// ── EVM event log decoding (ERC-20/721/1155 Transfer) ──

// keccak256("Transfer(address,address,uint256)")
const TOPIC_ERC20_TRANSFER = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// keccak256("TransferSingle(address,address,address,uint256,uint256)")
const TOPIC_ERC1155_TRANSFER_SINGLE = 'c3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
// keccak256("TransferBatch(address,address,address,uint256[],uint256[])")
const TOPIC_ERC1155_TRANSFER_BATCH = '4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb';

interface RawEVMLog {
  address: string;  // hex, no 0x
  topics: string[]; // hex strings, no 0x
  data: string;     // hex, no 0x
}

/** Extract address from a 32-byte topic (last 20 bytes) */
function topicToAddress(topic: string): string {
  const t = topic.replace(/^0x/, '').toLowerCase();
  if (t.length < 40) return '';
  return '0x' + t.slice(t.length - 40);
}

/** Extract uint256 from 32-byte hex */
function hexToDecimal(hex: string): string {
  const h = hex.replace(/^0x/, '').replace(/^0+/, '') || '0';
  return BigInt('0x' + h).toString();
}

/**
 * RLP-decode EVM logs from a byte array.
 * Logs are RLP-encoded as: list[ list[address(20B), list[topic...], data], ... ]
 */
export function rlpDecodeLogs(hexOrBytes: string | number[] | Uint8Array): RawEVMLog[] {
  let bytes: Uint8Array;
  if (typeof hexOrBytes === 'string') {
    const hex = hexOrBytes.replace(/^0x/, '');
    if (hex.length === 0 || hex.length % 2 !== 0) return [];
    bytes = new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  } else if (hexOrBytes instanceof Uint8Array) {
    bytes = hexOrBytes;
  } else {
    bytes = new Uint8Array(hexOrBytes.map(b => Number(b) & 0xff));
  }

  if (bytes.length === 0) return [];

  // Minimal RLP decoder
  let pos = 0;

  function readLength(): { dataStart: number; dataLen: number; isList: boolean } | null {
    if (pos >= bytes.length) return null;
    const b = bytes[pos];
    if (b <= 0x7f) {
      return { dataStart: pos, dataLen: 1, isList: false };
    }
    if (b <= 0xb7) {
      const len = b - 0x80;
      pos++;
      return { dataStart: pos, dataLen: len, isList: false };
    }
    if (b <= 0xbf) {
      const ll = b - 0xb7;
      pos++;
      let len = 0;
      for (let i = 0; i < ll; i++) len = (len * 256) + bytes[pos + i];
      pos += ll;
      return { dataStart: pos, dataLen: len, isList: false };
    }
    if (b <= 0xf7) {
      const len = b - 0xc0;
      pos++;
      return { dataStart: pos, dataLen: len, isList: true };
    }
    // b >= 0xf8
    const ll = b - 0xf7;
    pos++;
    let len = 0;
    for (let i = 0; i < ll; i++) len = (len * 256) + bytes[pos + i];
    pos += ll;
    return { dataStart: pos, dataLen: len, isList: true };
  }

  function readBytes(): Uint8Array {
    if (pos >= bytes.length) return new Uint8Array(0);
    const b = bytes[pos];
    if (b <= 0x7f) { pos++; return new Uint8Array([b]); }
    const info = readLength();
    if (!info || info.isList) return new Uint8Array(0);
    const out = bytes.slice(info.dataStart, info.dataStart + info.dataLen);
    pos = info.dataStart + info.dataLen;
    return out;
  }

  const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');

  try {
    // Outer list
    const outer = readLength();
    if (!outer || !outer.isList) return [];
    const outerEnd = outer.dataStart + outer.dataLen;

    const logs: RawEVMLog[] = [];

    while (pos < outerEnd) {
      // Each log is a list [address, topics, data]
      const logInfo = readLength();
      if (!logInfo || !logInfo.isList) break;
      const logEnd = logInfo.dataStart + logInfo.dataLen;

      // address (20 bytes string)
      const addrBytes = readBytes();
      const address = toHex(addrBytes);

      // topics list
      const topicsInfo = readLength();
      if (!topicsInfo || !topicsInfo.isList) { pos = logEnd; continue; }
      const topicsEnd = topicsInfo.dataStart + topicsInfo.dataLen;
      const topics: string[] = [];
      while (pos < topicsEnd) {
        const topicBytes = readBytes();
        if (topicBytes.length > 0) topics.push(toHex(topicBytes));
      }
      pos = topicsEnd;

      // data
      const dataBytes = readBytes();
      const data = toHex(dataBytes);

      logs.push({ address, topics, data });
      pos = logEnd;
    }

    return logs;
  } catch {
    return [];
  }
}

/** Try to extract logs from EVM.TransactionExecuted event fields */
function extractLogs(fields: Record<string, any>): RawEVMLog[] {
  // Try JSON array format first (from simulator or pre-parsed)
  for (const key of ['logs', 'eventLogs']) {
    const v = fields[key];
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && 'topics' in v[0]) {
      // Already parsed as JSON objects
      return v.map((log: any) => ({
        address: normalizeHexValue(log.address || log.contractAddress || ''),
        topics: (log.topics || []).map((t: any) => normalizeHexValue(t)),
        data: normalizeHexValue(log.data || ''),
      }));
    }
  }

  // Try RLP-encoded byte array
  for (const key of ['logs', 'eventLogs']) {
    const v = fields[key];
    if (v == null) continue;
    if (typeof v === 'string') {
      const logs = rlpDecodeLogs(v);
      if (logs.length > 0) return logs;
    }
    if (Array.isArray(v) && v.length > 0 && (typeof v[0] === 'number' || (typeof v[0] === 'object' && 'value' in v[0]))) {
      // Cadence UInt8 array or plain byte array
      const numArr = v.map((b: any) => {
        if (typeof b === 'number') return b;
        if (typeof b === 'object' && b.value != null) return Number(b.value);
        return Number(b);
      });
      const logs = rlpDecodeLogs(numArr);
      if (logs.length > 0) return logs;
    }
  }

  return [];
}

/** Decode a single EVM log into a token transfer, or null if not a recognized transfer */
function decodeLogTransfer(
  log: RawEVMLog,
  logIndex: number,
  eventIndex: number,
): EVMLogTransfer | null {
  if (log.topics.length === 0) return null;
  const topic0 = log.topics[0].toLowerCase();

  // ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
  // ERC-721 Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
  // Same topic0, distinguished by number of topics: 3 = ERC-20, 4 = ERC-721
  if (topic0 === TOPIC_ERC20_TRANSFER) {
    if (log.topics.length === 4) {
      // ERC-721
      return {
        contractAddress: '0x' + log.address,
        standard: 'erc721',
        from: topicToAddress(log.topics[1]),
        to: topicToAddress(log.topics[2]),
        amount: '1',
        tokenId: hexToDecimal(log.topics[3]),
        event_index: eventIndex,
        log_index: logIndex,
      };
    }
    if (log.topics.length === 3 && log.data.length >= 64) {
      // ERC-20
      return {
        contractAddress: '0x' + log.address,
        standard: 'erc20',
        from: topicToAddress(log.topics[1]),
        to: topicToAddress(log.topics[2]),
        amount: hexToDecimal(log.data.slice(0, 64)),
        tokenId: '',
        event_index: eventIndex,
        log_index: logIndex,
      };
    }
  }

  // ERC-1155 TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)
  if (topic0 === TOPIC_ERC1155_TRANSFER_SINGLE && log.topics.length === 4 && log.data.length >= 128) {
    return {
      contractAddress: '0x' + log.address,
      standard: 'erc1155',
      from: topicToAddress(log.topics[2]),
      to: topicToAddress(log.topics[3]),
      amount: hexToDecimal(log.data.slice(64, 128)),
      tokenId: hexToDecimal(log.data.slice(0, 64)),
      event_index: eventIndex,
      log_index: logIndex,
    };
  }

  // ERC-1155 TransferBatch — emit one EVMLogTransfer per id/value pair
  // Not handled here (returns null); handled in parseEVMLogTransfers for multi-return
  if (topic0 === TOPIC_ERC1155_TRANSFER_BATCH) {
    return null; // handled separately
  }

  return null;
}

/** Decode ERC-1155 TransferBatch into multiple transfers */
function decodeTransferBatch(
  log: RawEVMLog,
  logIndex: number,
  eventIndex: number,
): EVMLogTransfer[] {
  if (log.topics.length < 4 || log.data.length < 128) return [];
  const from = topicToAddress(log.topics[2]);
  const to = topicToAddress(log.topics[3]);
  const contractAddress = '0x' + log.address;

  // data: offset_ids(32B) + offset_values(32B) + ids_length(32B) + ids... + values_length(32B) + values...
  const data = log.data;
  try {
    const idsOffset = Number(BigInt('0x' + (data.slice(0, 64).replace(/^0+/, '') || '0'))) * 2;
    const idsLenHex = data.slice(idsOffset, idsOffset + 64);
    const idsLen = Number(BigInt('0x' + (idsLenHex.replace(/^0+/, '') || '0')));
    if (idsLen === 0 || idsLen > 256) return []; // sanity

    const valuesOffset = Number(BigInt('0x' + (data.slice(64, 128).replace(/^0+/, '') || '0'))) * 2;
    const valuesLenHex = data.slice(valuesOffset, valuesOffset + 64);
    const valuesLen = Number(BigInt('0x' + (valuesLenHex.replace(/^0+/, '') || '0')));
    if (valuesLen !== idsLen) return [];

    const transfers: EVMLogTransfer[] = [];
    for (let i = 0; i < idsLen; i++) {
      const idStart = idsOffset + 64 + i * 64;
      const valStart = valuesOffset + 64 + i * 64;
      if (idStart + 64 > data.length || valStart + 64 > data.length) break;
      transfers.push({
        contractAddress,
        standard: 'erc1155',
        from,
        to,
        tokenId: hexToDecimal(data.slice(idStart, idStart + 64)),
        amount: hexToDecimal(data.slice(valStart, valStart + 64)),
        event_index: eventIndex,
        log_index: logIndex,
      });
    }
    return transfers;
  } catch {
    return [];
  }
}

/**
 * Parse EVM event logs from EVM.TransactionExecuted events and extract
 * ERC-20/721/1155 token transfers.
 */
export function parseEVMLogTransfers(events: RawEvent[]): EVMLogTransfer[] {
  const results: EVMLogTransfer[] = [];

  for (const event of events) {
    if (!event.type.includes('EVM.TransactionExecuted')) continue;

    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    const fields = parseCadenceEventFields(payload) || payload;
    if (!fields) continue;

    const logs = extractLogs(fields);
    const eventIndex = event.event_index ?? 0;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const topic0 = log.topics[0]?.toLowerCase() ?? '';

      // TransferBatch needs special handling (multi-return)
      if (topic0 === TOPIC_ERC1155_TRANSFER_BATCH) {
        results.push(...decodeTransferBatch(log, i, eventIndex));
        continue;
      }

      const transfer = decodeLogTransfer(log, i, eventIndex);
      if (transfer) results.push(transfer);
    }
  }

  return results;
}
