/** Generic wrapper for FlowIndex API responses */
export interface FlowApiResponse<T = unknown> {
  data: T
  _meta?: { count?: number; limit?: number; offset?: number }
  error?: string | null
}

/** Flow account information */
export interface FlowAccountInfo {
  address: string
  balance: string
  keys: Array<{
    index: number
    publicKey: string
    signAlgo: string
    hashAlgo: string
    weight: number
    revoked: boolean
  }>
  contracts: string[]
}

/** Parameters for get_account tool */
export interface FlowGetAccountParams {
  address: string
}

/** Parameters for get_contract_code tool */
export interface FlowGetContractCodeParams {
  address: string
  contractName: string
}

/** Parameters for get_staking_info tool */
export interface FlowGetStakingInfoParams {
  address: string
}

/** Parameters for get_defi_positions tool */
export interface FlowGetDefiPositionsParams {
  address: string
}

/** Parameters for get_collection_metadata tool */
export interface FlowGetCollectionMetadataParams {
  nftType: string
}
