export enum InputType {
  FlowTxHash = 'flow_tx_hash',
  EvmTxHash = 'evm_tx_hash',
  FlowAddress = 'flow_address',
  EvmAddress = 'evm_address',
  FlowName = 'flow_name',
  BlockHeight = 'block_height',
  SearchQuery = 'search_query',
}

export interface DetectedInput {
  type: InputType;
  value: string | number;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

export function detectInputType(input: string): DetectedInput {
  const trimmed = input.trim();

  // .find or .fn name
  if (trimmed.endsWith('.find') || trimmed.endsWith('.fn')) {
    return { type: InputType.FlowName, value: trimmed };
  }

  // Numeric — block height
  if (/^\d+$/.test(trimmed)) {
    return { type: InputType.BlockHeight, value: parseInt(trimmed, 10) };
  }

  // 0x-prefixed
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const hex = trimmed.slice(2);

    if (!HEX_RE.test(hex)) {
      return { type: InputType.SearchQuery, value: trimmed };
    }

    // 0x + 64 hex = EVM tx hash
    if (hex.length === 64) {
      return { type: InputType.EvmTxHash, value: trimmed.toLowerCase() };
    }

    // 0x + 40 hex = EVM address
    if (hex.length === 40) {
      return { type: InputType.EvmAddress, value: trimmed.toLowerCase() };
    }

    // 0x + 16 hex = Flow address with 0x prefix
    if (hex.length === 16) {
      return { type: InputType.FlowAddress, value: hex.toLowerCase() };
    }

    return { type: InputType.SearchQuery, value: trimmed };
  }

  // No 0x prefix, pure hex
  if (HEX_RE.test(trimmed)) {
    if (trimmed.length === 64) {
      return { type: InputType.FlowTxHash, value: trimmed.toLowerCase() };
    }
    if (trimmed.length === 16) {
      return { type: InputType.FlowAddress, value: trimmed.toLowerCase() };
    }
  }

  return { type: InputType.SearchQuery, value: trimmed };
}
