import { describe, it, expect } from 'vitest';
import { parseEVMLogTransfers, rlpDecodeLogs } from '../evm.js';
import type { RawEvent } from '../types.js';

// ── Helper: build RLP-encoded logs ──

function rlpEncodeBytes(data: number[]): number[] {
  if (data.length === 0) return [0x80];
  if (data.length === 1 && data[0] <= 0x7f) return data;
  if (data.length <= 55) return [0x80 + data.length, ...data];
  const lenBytes: number[] = [];
  let l = data.length;
  while (l > 0) { lenBytes.unshift(l & 0xff); l >>= 8; }
  return [0xb7 + lenBytes.length, ...lenBytes, ...data];
}

function rlpEncodeList(items: number[][]): number[] {
  const payload = items.flat();
  if (payload.length <= 55) return [0xc0 + payload.length, ...payload];
  const lenBytes: number[] = [];
  let l = payload.length;
  while (l > 0) { lenBytes.unshift(l & 0xff); l >>= 8; }
  return [0xf7 + lenBytes.length, ...lenBytes, ...payload];
}

function hexToBytes(hex: string): number[] {
  return hex.match(/.{2}/g)!.map(b => parseInt(b, 16));
}

function padLeft(hex: string, bytes: number): string {
  return hex.padStart(bytes * 2, '0');
}

// Build a single RLP-encoded log entry
function buildRLPLog(address: string, topics: string[], data: string): number[] {
  const addrBytes = rlpEncodeBytes(hexToBytes(address));
  const topicItems = topics.map(t => rlpEncodeBytes(hexToBytes(t)));
  const topicsList = rlpEncodeList(topicItems);
  const dataBytes = rlpEncodeBytes(data ? hexToBytes(data) : []);
  return rlpEncodeList([addrBytes, topicsList, dataBytes]);
}

// Build RLP-encoded logs list
function buildRLPLogs(logs: { address: string; topics: string[]; data: string }[]): number[] {
  const logItems = logs.map(l => buildRLPLog(l.address, l.topics, l.data));
  return rlpEncodeList(logItems);
}

// Topic constants
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_SINGLE_TOPIC = 'c3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62';
const TRANSFER_BATCH_TOPIC = '4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb';

const CONTRACT_ADDR = 'a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'; // USDC-like
const FROM_ADDR = padLeft('dead', 32);
const TO_ADDR = padLeft('beef', 32);
const OPERATOR_ADDR = padLeft('cafe', 32);

// 32-byte hash for EVM.TransactionExecuted
const HASH_HEX = 'ab'.repeat(32);

function makeEVMEvent(logsField: any, extra?: Record<string, any>): RawEvent {
  return {
    type: 'A.e467b9dd11fa00df.EVM.TransactionExecuted',
    event_index: 0,
    payload: {
      hash: HASH_HEX,
      from: 'aa'.repeat(20),
      to: 'bb'.repeat(20),
      gasConsumed: '21000',
      logs: logsField,
      ...extra,
    },
  };
}

describe('rlpDecodeLogs', () => {
  it('decodes a single log with one topic', () => {
    const logsBytes = buildRLPLogs([{
      address: CONTRACT_ADDR,
      topics: [TRANSFER_TOPIC],
      data: padLeft('1000', 32),
    }]);
    const logs = rlpDecodeLogs(logsBytes);
    expect(logs).toHaveLength(1);
    expect(logs[0].address).toBe(CONTRACT_ADDR);
    expect(logs[0].topics).toHaveLength(1);
    expect(logs[0].topics[0]).toBe(TRANSFER_TOPIC);
  });

  it('decodes multiple logs', () => {
    const logsBytes = buildRLPLogs([
      { address: CONTRACT_ADDR, topics: [TRANSFER_TOPIC, FROM_ADDR, TO_ADDR], data: padLeft('64', 32) },
      { address: 'cc'.repeat(20), topics: [TRANSFER_TOPIC, TO_ADDR, FROM_ADDR], data: padLeft('c8', 32) },
    ]);
    const logs = rlpDecodeLogs(logsBytes);
    expect(logs).toHaveLength(2);
    expect(logs[0].address).toBe(CONTRACT_ADDR);
    expect(logs[1].address).toBe('cc'.repeat(20));
  });

  it('returns empty for empty input', () => {
    expect(rlpDecodeLogs('')).toEqual([]);
    expect(rlpDecodeLogs([])).toEqual([]);
  });

  it('returns empty for invalid RLP', () => {
    expect(rlpDecodeLogs('ffff')).toEqual([]);
  });
});

describe('parseEVMLogTransfers - ERC-20', () => {
  it('decodes ERC-20 Transfer from JSON logs', () => {
    const event = makeEVMEvent([{
      address: CONTRACT_ADDR,
      topics: [TRANSFER_TOPIC, FROM_ADDR, TO_ADDR],
      data: padLeft('3e8', 32), // 1000
    }]);

    const transfers = parseEVMLogTransfers([event]);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].standard).toBe('erc20');
    expect(transfers[0].contractAddress).toBe('0x' + CONTRACT_ADDR);
    expect(transfers[0].from).toBe('0x' + padLeft('dead', 20));
    expect(transfers[0].to).toBe('0x' + padLeft('beef', 20));
    expect(transfers[0].amount).toBe('1000');
    expect(transfers[0].tokenId).toBe('');
  });

  it('decodes ERC-20 Transfer from RLP-encoded logs', () => {
    const logsBytes = buildRLPLogs([{
      address: CONTRACT_ADDR,
      topics: [TRANSFER_TOPIC, FROM_ADDR, TO_ADDR],
      data: padLeft('3e8', 32),
    }]);
    const event = makeEVMEvent(logsBytes);

    const transfers = parseEVMLogTransfers([event]);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].standard).toBe('erc20');
    expect(transfers[0].amount).toBe('1000');
  });
});

describe('parseEVMLogTransfers - ERC-721', () => {
  it('decodes ERC-721 Transfer (4 topics)', () => {
    const tokenIdTopic = padLeft('2a', 32); // tokenId = 42
    const event = makeEVMEvent([{
      address: CONTRACT_ADDR,
      topics: [TRANSFER_TOPIC, FROM_ADDR, TO_ADDR, tokenIdTopic],
      data: '',
    }]);

    const transfers = parseEVMLogTransfers([event]);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].standard).toBe('erc721');
    expect(transfers[0].amount).toBe('1');
    expect(transfers[0].tokenId).toBe('42');
    expect(transfers[0].from).toBe('0x' + padLeft('dead', 20));
    expect(transfers[0].to).toBe('0x' + padLeft('beef', 20));
  });
});

describe('parseEVMLogTransfers - ERC-1155', () => {
  it('decodes TransferSingle', () => {
    const event = makeEVMEvent([{
      address: CONTRACT_ADDR,
      topics: [TRANSFER_SINGLE_TOPIC, OPERATOR_ADDR, FROM_ADDR, TO_ADDR],
      data: padLeft('5', 32) + padLeft('a', 32), // id=5, value=10
    }]);

    const transfers = parseEVMLogTransfers([event]);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].standard).toBe('erc1155');
    expect(transfers[0].tokenId).toBe('5');
    expect(transfers[0].amount).toBe('10');
    expect(transfers[0].from).toBe('0x' + padLeft('dead', 20));
    expect(transfers[0].to).toBe('0x' + padLeft('beef', 20));
  });

  it('decodes TransferBatch with 2 items', () => {
    // ABI-encoded: offset_ids(32B) + offset_values(32B) + ids_len(32B) + ids... + values_len(32B) + values...
    const data =
      padLeft('40', 32) + // offset to ids = 64 bytes (word 2)
      padLeft('a0', 32) + // offset to values = 160 bytes (word 5)
      padLeft('2', 32) +  // ids length = 2
      padLeft('1', 32) +  // id[0] = 1
      padLeft('2', 32) +  // id[1] = 2
      padLeft('2', 32) +  // values length = 2
      padLeft('64', 32) + // value[0] = 100
      padLeft('c8', 32);  // value[1] = 200

    const event = makeEVMEvent([{
      address: CONTRACT_ADDR,
      topics: [TRANSFER_BATCH_TOPIC, OPERATOR_ADDR, FROM_ADDR, TO_ADDR],
      data,
    }]);

    const transfers = parseEVMLogTransfers([event]);
    expect(transfers).toHaveLength(2);
    expect(transfers[0].standard).toBe('erc1155');
    expect(transfers[0].tokenId).toBe('1');
    expect(transfers[0].amount).toBe('100');
    expect(transfers[1].tokenId).toBe('2');
    expect(transfers[1].amount).toBe('200');
  });
});

describe('parseEVMLogTransfers - edge cases', () => {
  it('returns empty for non-EVM events', () => {
    expect(parseEVMLogTransfers([{
      type: 'A.1654653399040a61.FlowToken.TokensWithdrawn',
      payload: { amount: '1.0' },
    }])).toEqual([]);
  });

  it('returns empty when no logs field', () => {
    const event: RawEvent = {
      type: 'A.e467b9dd11fa00df.EVM.TransactionExecuted',
      event_index: 0,
      payload: { hash: HASH_HEX, from: 'aa'.repeat(20), to: 'bb'.repeat(20) },
    };
    expect(parseEVMLogTransfers([event])).toEqual([]);
  });

  it('skips unrecognized log topics', () => {
    const event = makeEVMEvent([{
      address: CONTRACT_ADDR,
      topics: ['aaaa'.repeat(16)], // random topic
      data: '',
    }]);
    expect(parseEVMLogTransfers([event])).toEqual([]);
  });

  it('handles mixed transfer types in one tx', () => {
    const event = makeEVMEvent([
      // ERC-20
      { address: CONTRACT_ADDR, topics: [TRANSFER_TOPIC, FROM_ADDR, TO_ADDR], data: padLeft('64', 32) },
      // ERC-721
      { address: 'dd'.repeat(20), topics: [TRANSFER_TOPIC, FROM_ADDR, TO_ADDR, padLeft('7', 32)], data: '' },
      // ERC-1155
      { address: 'ee'.repeat(20), topics: [TRANSFER_SINGLE_TOPIC, OPERATOR_ADDR, FROM_ADDR, TO_ADDR], data: padLeft('1', 32) + padLeft('5', 32) },
    ]);

    const transfers = parseEVMLogTransfers([event]);
    expect(transfers).toHaveLength(3);
    expect(transfers[0].standard).toBe('erc20');
    expect(transfers[1].standard).toBe('erc721');
    expect(transfers[2].standard).toBe('erc1155');
  });

  it('handles Cadence UInt8 byte array format for logs', () => {
    const logsBytes = buildRLPLogs([{
      address: CONTRACT_ADDR,
      topics: [TRANSFER_TOPIC, FROM_ADDR, TO_ADDR],
      data: padLeft('3e8', 32),
    }]);
    // Convert to Cadence UInt8 array format
    const cadenceArray = logsBytes.map(b => ({ type: 'UInt8', value: String(b) }));
    const event = makeEVMEvent(cadenceArray);

    const transfers = parseEVMLogTransfers([event]);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].standard).toBe('erc20');
    expect(transfers[0].amount).toBe('1000');
  });
});
