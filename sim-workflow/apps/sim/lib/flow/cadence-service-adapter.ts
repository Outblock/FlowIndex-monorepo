/**
 * Flow Transfer Strategy Module
 *
 * Implements the send strategy pattern from @onflow/frw-workflow using
 * @onflow/frw-cadence's CadenceService directly. This avoids importing
 * frw-workflow (which publishes raw .ts source with broken imports that
 * Turbopack cannot compile).
 *
 * Supports 17 transfer strategies:
 *  - 9 token strategies (Flow-to-Flow, Flow-to-EVM, EVM-to-Flow, etc.)
 *  - 8 NFT strategies (Flow-to-Flow, bridges, child accounts, TopShot, etc.)
 */
import { CadenceService, addresses } from '@onflow/frw-cadence'
import * as fcl from '@onflow/fcl'
import { createLogger } from '@sim/logger'

const logger = createLogger('FlowTransferStrategy')

/** Payload interface matching @onflow/frw-workflow SendPayload */
export interface SendPayload {
  type: 'token' | 'nft'
  assetType: 'flow' | 'evm'
  proposer: string
  receiver: string
  flowIdentifier: string
  sender: string
  childAddrs: string[]
  ids: number[]
  amount: string
  decimal: number
  coaAddr: string
  tokenContractAddr: string
}

/** Validate Flow address format (0x + 16 hex chars) */
function isFlowAddr(address: string): boolean {
  return /^0x[a-fA-F0-9]{16}$/.test(address)
}

/** Validate EVM address format (0x + 40 hex chars) */
function isEvmAddr(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Encode EVM contract call data for token/NFT transfers.
 * Dynamically imports ethers to avoid bundling issues.
 */
async function encodeEvmContractCallData(payload: SendPayload): Promise<number[]> {
  const { ethers, parseUnits } = await import('ethers')
  const { type, amount = '', receiver, decimal, ids, sender } = payload

  if (receiver.length !== 42) throw new Error('Invalid Ethereum address')
  let callData = '0x'

  if (type === 'token') {
    const valueBig = parseUnits(Number(amount).toString(), decimal)
    const abi = ['function transfer(address to, uint256 value)']
    const iface = new ethers.Interface(abi)
    callData = iface.encodeFunctionData('transfer', [receiver, valueBig])
  } else {
    if (ids.length === 1) {
      if (amount === '') {
        const abi = ['function safeTransferFrom(address from, address to, uint256 tokenId)']
        const iface = new ethers.Interface(abi)
        callData = iface.encodeFunctionData('safeTransferFrom', [sender, receiver, ids[0]])
      } else {
        const abi = [
          'function safeTransferFrom(address from, address to, uint256 tokenId, uint256 amount, bytes data)',
        ]
        const iface = new ethers.Interface(abi)
        callData = iface.encodeFunctionData('safeTransferFrom', [
          sender,
          receiver,
          ids[0],
          amount,
          '0x',
        ])
      }
    }
  }

  const dataBuffer = Buffer.from(callData.slice(2), 'hex')
  return Array.from(Uint8Array.from(dataBuffer))
}

/**
 * Create a configured CadenceService instance with the given authz function
 * and network address aliases.
 */
export function createConfiguredCadenceService(
  authz: unknown,
  network: 'mainnet' | 'testnet'
): CadenceService {
  const svc = new CadenceService()

  // Inject our signer's authz for all transactions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc.useRequestInterceptor(async (config: any) => {
    if (config.type === 'transaction') {
      config.payer = authz
      config.proposer = authz
      config.authorizations = [authz]
    }
    return config
  })

  return svc
}

/**
 * Configure FCL with network-specific settings and contract address aliases.
 */
export function configureFclForNetwork(
  network: 'mainnet' | 'testnet',
  accessNode: string
): void {
  fcl.config()
    .put('flow.network', network)
    .put('accessNode.api', accessNode)

  const addrMap = addresses[network]
  for (const key in addrMap) {
    fcl.config().put(key, addrMap[key as keyof typeof addrMap])
  }
}

/**
 * Execute a send transaction using the strategy pattern.
 * Routes to the appropriate CadenceService method based on payload characteristics.
 *
 * @returns Transaction ID string, or null if no strategy matches
 */
export async function executeTransfer(
  svc: CadenceService,
  payload: SendPayload
): Promise<string | null> {
  const { type, assetType, proposer, receiver, sender, childAddrs, flowIdentifier, amount, ids, coaAddr, decimal, tokenContractAddr } = payload

  // ─── Token Strategies ───────────────────────────────────────────────

  if (type === 'token') {
    // Child-to-child token transfer
    if (childAddrs.length > 0 && childAddrs.includes(receiver) && childAddrs.includes(sender)) {
      logger.info('Strategy: ChildToChildToken')
      return await svc.sendChildFtToChild(flowIdentifier, sender, receiver, amount)
    }

    // Child-to-others token transfer
    if (childAddrs.length > 0 && childAddrs.includes(sender) && assetType === 'flow') {
      if (receiver === proposer) {
        logger.info('Strategy: ChildToParentToken')
        return await svc.transferChildFt(flowIdentifier, sender, amount)
      }
      if (receiver === coaAddr) {
        logger.info('Strategy: ChildToCoaToken (bridge)')
        return await svc.bridgeChildFtToEvm(flowIdentifier, sender, amount)
      }
      if (isEvmAddr(receiver)) {
        logger.info('Strategy: ChildToEvmToken (bridge)')
        return await svc.bridgeChildFtToEvmAddress(flowIdentifier, sender, amount, receiver)
      }
      logger.info('Strategy: ChildToFlowToken')
      return await svc.sendChildFt(flowIdentifier, sender, receiver, amount)
    }

    // Parent-to-child token transfer (EVM sender = COA)
    if (childAddrs.length > 0 && childAddrs.includes(receiver) && assetType === 'evm' && sender === coaAddr) {
      const { parseUnits } = await import('ethers')
      const valueBig = parseUnits(amount, decimal)
      logger.info('Strategy: ParentToChildToken (EVM bridge)')
      return await svc.bridgeChildFtFromEvm(flowIdentifier, receiver, valueBig.toString())
    }

    // Flow-to-Flow token transfer
    if (assetType === 'flow' && isFlowAddr(receiver)) {
      logger.info('Strategy: FlowToFlowToken')
      return await svc.transferTokensV3(flowIdentifier, receiver, amount)
    }

    // Flow-to-EVM FLOW token transfer (native FLOW)
    if (assetType === 'flow' && flowIdentifier.includes('FlowToken') && isEvmAddr(receiver)) {
      logger.info('Strategy: FlowToEvmFlowToken')
      return await svc.transferFlowToEvmAddress(receiver, amount, 30_000_000)
    }

    // Flow-to-EVM token bridge (non-FLOW tokens)
    if (assetType === 'flow' && isEvmAddr(receiver)) {
      logger.info('Strategy: FlowTokenBridgeToEvm')
      return await svc.bridgeTokensToEvmAddressV2(flowIdentifier, amount, receiver)
    }

    // EVM-to-Flow FLOW token COA withdrawal
    if (assetType === 'evm' && flowIdentifier.includes('FlowToken') && isFlowAddr(receiver)) {
      logger.info('Strategy: EvmToFlowCoaWithdrawal')
      return await svc.withdrawCoa(amount, receiver)
    }

    // EVM-to-Flow token bridge
    if (assetType === 'evm' && isFlowAddr(receiver)) {
      logger.info('Strategy: EvmToFlowTokenBridge')
      return await svc.bridgeTokensFromEvmToFlowV3(flowIdentifier, amount, receiver)
    }

    // EVM-to-EVM token transfer
    if (assetType === 'evm' && isEvmAddr(receiver)) {
      logger.info('Strategy: EvmToEvmToken')
      if (flowIdentifier.includes('FlowToken')) {
        return await svc.callContract(
          '0x0000000000000000000000000000000000000000',
          amount,
          [],
          30_000_000
        )
      } else {
        const data = await encodeEvmContractCallData(payload)
        return await svc.callContract(tokenContractAddr, '0.0', data, 30_000_000)
      }
    }
  }

  // ─── NFT Strategies ─────────────────────────────────────────────────

  if (type === 'nft') {
    // Child-to-child NFT transfer
    if (childAddrs.length > 0 && childAddrs.includes(receiver) && childAddrs.includes(sender)) {
      logger.info('Strategy: ChildToChildNft')
      return await svc.batchSendChildNftToChild(flowIdentifier, sender, receiver, ids)
    }

    // Child-to-others NFT transfer
    if (childAddrs.length > 0 && childAddrs.includes(sender) && assetType === 'flow') {
      if (receiver === proposer) {
        logger.info('Strategy: ChildToParentNft')
        return await svc.batchTransferChildNft(flowIdentifier, sender, ids)
      }
      if (receiver === coaAddr) {
        logger.info('Strategy: ChildToCoaNft (bridge)')
        return await svc.batchBridgeChildNftToEvm(flowIdentifier, sender, ids)
      }
      if (isEvmAddr(receiver)) {
        logger.info('Strategy: ChildToEvmNft (bridge)')
        return await svc.batchBridgeChildNftToEvmAddress(flowIdentifier, sender, ids, receiver)
      }
      logger.info('Strategy: ChildToFlowNft')
      return await svc.batchSendChildNft(flowIdentifier, sender, receiver, ids)
    }

    // Parent-to-child NFT transfer (EVM sender = COA)
    if (childAddrs.length > 0 && childAddrs.includes(receiver) && assetType === 'evm' && sender === coaAddr) {
      logger.info('Strategy: ParentToChildNft (EVM bridge)')
      return await svc.batchBridgeChildNftFromEvm(flowIdentifier, receiver, ids.map(String))
    }

    // TopShot NFT transfer
    if (assetType === 'flow' && flowIdentifier.includes('TopShot') && isFlowAddr(receiver)) {
      logger.info('Strategy: TopShotNft')
      return await svc.sendNbaNftV3(flowIdentifier, receiver, ids[0])
    }

    // Flow-to-Flow NFT transfer (single NFT)
    if (assetType === 'flow' && isFlowAddr(receiver) && ids.length === 1) {
      logger.info('Strategy: FlowToFlowNft')
      return await svc.sendNft(flowIdentifier, receiver, ids[0])
    }

    // Flow-to-EVM NFT bridge
    if (assetType === 'flow' && isEvmAddr(receiver)) {
      logger.info('Strategy: FlowToEvmNftBridge')
      return await svc.batchBridgeNftToEvmAddress(flowIdentifier, ids, receiver)
    }

    // EVM-to-Flow NFT bridge
    if (assetType === 'evm' && isFlowAddr(receiver)) {
      logger.info('Strategy: EvmToFlowNftBridge')
      return await svc.batchBridgeNftFromEvmToFlow(flowIdentifier, ids.map(String), receiver)
    }

    // EVM-to-EVM NFT transfer
    if (assetType === 'evm' && isEvmAddr(receiver)) {
      logger.info('Strategy: EvmToEvmNft')
      const data = await encodeEvmContractCallData(payload)
      return await svc.callContract(tokenContractAddr, '0.0', data, 30_000_000)
    }
  }

  // No matching strategy
  return null
}
