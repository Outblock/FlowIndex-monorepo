// Block
export interface Block {
  height: number;
  id: string;
  parent_id: string;
  timestamp: string;
  tx_count: number;
  event_count: number;
  collection_count: number;
}

// Transaction
export interface Transaction {
  id: string;
  block_height: number;
  block_id?: string;
  timestamp: string;
  status: string;
  error?: string;
  fee?: number;
  proposer?: string;
  authorizers?: string[];
  payer?: string;
  gas_used?: number;
  event_count?: number;
  events?: TransactionEvent[];
  transfer_summary?: { ft: unknown[]; nft: unknown[] };
  transaction_index?: number;
  is_evm?: boolean;
  evm_hash?: string;
}

export interface TransactionEvent {
  type: string;
  transaction_id: string;
  transaction_index: number;
  event_index: number;
  value: string;
}

// EVM Transaction
export interface EvmTransaction {
  hash: string;
  block_height: number;
  timestamp: string;
  from_address: string;
  to_address?: string;
  value: string;
  gas_used: number;
  gas_price?: string;
  status: string;
  cadence_tx_id?: string;
  logs?: EvmLog[];
  internal_txs?: EvmInternalTx[];
  token_transfers?: EvmTokenTransfer[];
}

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  log_index: number;
}

export interface EvmInternalTx {
  from_address: string;
  to_address: string;
  value: string;
  call_type: string;
}

export interface EvmTokenTransfer {
  token_address: string;
  from_address: string;
  to_address: string;
  value: string;
  token_type: string;
}

// Account
export interface Account {
  address: string;
  flowBalance: number;
  flowStorage?: number;
  keys?: AccountKey[];
  contracts?: string[];
  is_contract?: boolean;
}

export interface AccountKey {
  index: string;
  key: string;
  signatureAlgorithm: string;
  hashAlgorithm: string;
  weight: number;
  revoked: boolean;
}

// FT Holding
export interface FtHolding {
  token_type: string;
  token_name?: string;
  balance: string;
  usd_value?: number;
}

// NFT Collection
export interface NftCollection {
  collection_type: string;
  collection_name?: string;
  count: number;
}

// Search
export interface SearchContract {
  address: string;
  name: string;
  kind?: string;
  dependent_count?: number;
}

export interface SearchToken {
  address: string;
  contract_name: string;
  name: string;
  symbol: string;
}

export interface SearchResponse {
  data: {
    contracts?: SearchContract[];
    tokens?: SearchToken[];
    accounts?: unknown[];
    blocks?: unknown[];
    transactions?: unknown[];
  };
}

// List response wrapper
export interface ListResponse<T> {
  data: T[];
  hasMore?: boolean;
  total?: number;
}

// EVM Address
export interface EvmAddress {
  address: string;
  balance?: string;
  nonce?: number;
  is_contract?: boolean;
}

// Client config
export interface FlowIndexClientConfig {
  baseUrl?: string;
}
