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
  tx_id: string;
  block_height: number;
  block_id?: string;
  timestamp: string;
  status: string;
  status_code: number;
  error_message?: string;
  script?: string;
  arguments?: string[];
  authorizers?: string[];
  payer?: string;
  proposal_key_address?: string;
  gas_limit?: number;
  gas_used?: number;
  events?: TransactionEvent[];
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
  balance: number;
  keys?: AccountKey[];
  contracts?: string[];
  is_contract?: boolean;
}

export interface AccountKey {
  index: number;
  public_key: string;
  sign_algo: string;
  hash_algo: string;
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
export interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string;
}

export interface SearchResponse {
  results: SearchResult[];
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
