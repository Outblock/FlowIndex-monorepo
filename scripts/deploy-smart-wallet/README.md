# Smart Wallet Contract Deployment

Foundry project for deploying Coinbase Smart Wallet + VerifyingPaymaster to Flow-EVM.

## Contracts

| Script | Deploys | Description |
|--------|---------|-------------|
| `DeployFactory.s.sol` | CoinbaseSmartWallet + CoinbaseSmartWalletFactory | ERC-4337 smart account with passkey (P-256) support |
| `DeployPaymaster.s.sol` | VerifyingPaymaster | Gas sponsoring — trusted signer approves UserOps |

## Deployed Addresses (CREATE2 — same on Testnet 545 & Mainnet 747)

| Contract | Address |
|----------|---------|
| CoinbaseSmartWallet (impl) | `0x8fc3Ff55d9cb304141097d5f5e57D4699f773b08` |
| CoinbaseSmartWalletFactory | `0x8E4333c6878A32F49611670EAD1793597392C48f` |
| VerifyingPaymaster | `0x6160d63ca23b9364e44daf9ca2acd72e374eaef5` |

Canonical (pre-deployed, no action needed):
- EntryPoint v0.7: `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- CREATE2 Deployer: `0x4e59b44847b379578588920cA78FbF26c0B4956C`

Salt: `0x000...0f10b1` — all contracts deployed via CREATE2 deployer for deterministic cross-network addresses.

## Setup

```bash
# Install dependencies (Foundry must be installed: https://getfoundry.sh)
forge install foundry-rs/forge-std coinbase/smart-wallet --no-git

# Copy env
cp .env.example .env
# Edit .env with deployer private key and paymaster signer address
```

## Deploy

### Smart Wallet Factory

```bash
source .env
forge script script/DeployFactory.s.sol:DeployFactory \
  --rpc-url $FLOW_EVM_TESTNET_RPC \
  --broadcast
```

### Paymaster

```bash
source .env
forge script script/DeployPaymaster.s.sol:DeployPaymaster \
  --rpc-url $FLOW_EVM_TESTNET_RPC \
  --broadcast
```

The paymaster script also:
- Deposits 10 FLOW to EntryPoint (for sponsoring user gas)
- Stakes 1 FLOW (required by ERC-4337 for paymasters)

### Mainnet

Same commands, use `$FLOW_EVM_MAINNET_RPC` instead.

## Verify Deployment

```bash
# Check factory works
cast call <FACTORY_ADDRESS> \
  "getAddress(bytes[],uint256)(address)" \
  "[0x$(python3 -c 'print(\"00\"*64)')]" 0 \
  --rpc-url $FLOW_EVM_TESTNET_RPC

# Check paymaster deposit
cast call 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "balanceOf(address)(uint256)" <PAYMASTER_ADDRESS> \
  --rpc-url $FLOW_EVM_TESTNET_RPC
```

## Security

- `.env` is gitignored — never commit private keys
- `broadcast/` and `cache/` are gitignored — they contain deployment transaction data with key material
- Deployer key and paymaster signer key are backed up in GitHub Secrets
