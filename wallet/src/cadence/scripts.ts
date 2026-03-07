/**
 * Cadence transaction scripts for the wallet.
 */

/**
 * FLOW token transfer transaction.
 * Uses the Cadence 1.0 / Crescendo syntax with capabilities.
 */
export const FLOW_TRANSFER_TX = `
import FungibleToken from 0xFungibleToken
import FlowToken from 0xFlowToken

transaction(amount: UFix64, to: Address) {
    let sentVault: @{FungibleToken.Vault}
    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow reference to the owner's Vault!")
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }
    execute {
        let receiverRef = getAccount(to).capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow receiver reference to the recipient's Vault")
        receiverRef.deposit(from: <-self.sentVault)
    }
}
`.trim();

/**
 * FCL contract address aliases for mainnet.
 */
export const MAINNET_ALIASES: Record<string, string> = {
  '0xFungibleToken': '0xf233dcee88fe0abe',
  '0xFlowToken': '0x1654653399040a61',
};

/**
 * FCL contract address aliases for testnet.
 */
export const TESTNET_ALIASES: Record<string, string> = {
  '0xFungibleToken': '0x9a0766d93b6608b7',
  '0xFlowToken': '0x7e60df042a9c0868',
};
