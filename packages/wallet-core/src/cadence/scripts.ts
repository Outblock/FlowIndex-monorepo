/**
 * Cadence transaction scripts for wallet operations.
 */

export const FLOW_TRANSFER_TX = `
import "FungibleToken"
import "FlowToken"

transaction(amount: UFix64, to: Address) {
    let sentVault: @{FungibleToken.Vault}

    prepare(signer: auth(BorrowValue) &Account) {
        let vaultRef = signer.storage.borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(from: /storage/flowTokenVault)
            ?? panic("Could not borrow reference to the owner's Vault!")
        self.sentVault <- vaultRef.withdraw(amount: amount)
    }

    execute {
        let receiverRef = getAccount(to)
            .capabilities.borrow<&{FungibleToken.Receiver}>(/public/flowTokenReceiver)
            ?? panic("Could not borrow receiver reference to the recipient's Vault")
        receiverRef.deposit(from: <-self.sentVault)
    }
}
`;

export const MAINNET_ALIASES: Record<string, string> = {
  FungibleToken: '0xf233dcee88fe0abe',
  FlowToken: '0x1654653399040a61',
};

export const TESTNET_ALIASES: Record<string, string> = {
  FungibleToken: '0x9a0766d93b6608b7',
  FlowToken: '0x7e60df042a9c0868',
};
