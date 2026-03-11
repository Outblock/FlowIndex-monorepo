export interface TemplateArg {
  name: string
  type: string
  defaultValue: string
}

export interface Template {
  id: string
  name: string
  filename: string
  cadence: string
  args: TemplateArg[]
}

export const templates: Template[] = [
  {
    id: 'transfer-flow',
    name: 'Transfer FLOW',
    filename: 'transfer-flow.cdc',
    cadence: `import FungibleToken from 0xf233dcee88fe0abe
import FlowToken from 0x1654653399040a61

transaction(amount: UFix64, to: Address) {
    let sentVault: @{FungibleToken.Vault}

    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow reference to the owner's Vault!")

        self.sentVault <- vaultRef.withdraw(amount: amount)
    }

    execute {
        let receiverRef = getAccount(to)
            .capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow receiver reference")

        receiverRef.deposit(from: <- self.sentVault)
    }
}`,
    args: [
      { name: 'amount', type: 'UFix64', defaultValue: '10.0' },
      { name: 'to', type: 'Address', defaultValue: '0xf8d6e0586b0a20c7' },
    ],
  },
  {
    id: 'mint-nft',
    name: 'Mint NFT',
    filename: 'mint-nft.cdc',
    cadence: `import NonFungibleToken from 0x1d7e57aa55817448
import MetadataViews from 0x1d7e57aa55817448

transaction(recipient: Address) {
    prepare(signer: auth(BorrowValue) &Account) {
        let minter = signer.storage.borrow<&{NonFungibleToken.Minter}>(
            from: /storage/NFTMinter
        ) ?? panic("Could not borrow minter reference")

        let nft <- minter.mint()

        let receiverRef = getAccount(recipient)
            .capabilities.borrow<&{NonFungibleToken.Receiver}>(
                /public/NFTReceiver
            ) ?? panic("Could not borrow receiver reference")

        receiverRef.deposit(token: <- nft)
    }
}`,
    args: [
      { name: 'recipient', type: 'Address', defaultValue: '0xf8d6e0586b0a20c7' },
    ],
  },
  {
    id: 'token-swap',
    name: 'Token Swap',
    filename: 'token-swap.cdc',
    cadence: `import FungibleToken from 0xf233dcee88fe0abe
import FlowToken from 0x1654653399040a61

transaction(amountIn: UFix64, minAmountOut: UFix64) {
    let inVault: @{FungibleToken.Vault}

    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW vault")

        self.inVault <- vaultRef.withdraw(amount: amountIn)
    }

    execute {
        destroy self.inVault
        log("Swap executed")
    }
}`,
    args: [
      { name: 'amountIn', type: 'UFix64', defaultValue: '100.0' },
      { name: 'minAmountOut', type: 'UFix64', defaultValue: '95.0' },
    ],
  },
  {
    id: 'deploy-contract',
    name: 'Deploy Contract',
    filename: 'deploy-contract.cdc',
    cadence: `transaction(name: String, code: String) {
    prepare(signer: auth(AddContract) &Account) {
        signer.contracts.add(name: name, code: code.utf8)
    }
}`,
    args: [
      { name: 'name', type: 'String', defaultValue: 'HelloWorld' },
      { name: 'code', type: 'String', defaultValue: 'access(all) contract HelloWorld { access(all) fun hello(): String { return "Hello!" } }' },
    ],
  },
  {
    id: 'stake-flow',
    name: 'Stake FLOW',
    filename: 'stake-flow.cdc',
    cadence: `import FlowToken from 0x1654653399040a61
import FungibleToken from 0xf233dcee88fe0abe
import FlowIDTableStaking from 0x8624b52f9ddcd04a

transaction(amount: UFix64, nodeID: String) {
    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
            from: /storage/flowTokenVault
        ) ?? panic("Could not borrow FLOW vault")

        let stakerRef = signer.storage.borrow<&FlowIDTableStaking.NodeStaker>(
            from: /storage/flowStaker
        ) ?? panic("Could not borrow staker reference")

        let tokens <- vaultRef.withdraw(amount: amount)
        stakerRef.stakeNewTokens(from: <- tokens)
    }
}`,
    args: [
      { name: 'amount', type: 'UFix64', defaultValue: '100.0' },
      { name: 'nodeID', type: 'String', defaultValue: '0000000000000000000000000000000000000000000000000000000000000001' },
    ],
  },
]
