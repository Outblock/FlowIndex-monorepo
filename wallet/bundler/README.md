# ERC-4337 Bundler + Paymaster

Alto bundler and VerifyingPaymaster signing service for the FlowIndex passkey wallet on Flow-EVM.

## Architecture

```
bundler.flowindex.io (Caddy TLS)
├── /545/rpc        → Alto testnet   (:4337)  — testnet UserOp submission
├── /747/rpc        → Alto mainnet   (:4347)  — mainnet UserOp submission
├── /545/paymaster  → Paymaster      (:4338)  — testnet gas sponsoring
└── /747/paymaster  → Paymaster      (:4348)  — mainnet gas sponsoring
```

URL pattern follows Pimlico convention: `/{chainId}/rpc` and `/{chainId}/paymaster`.

## Infrastructure

| Component | Detail |
|-----------|--------|
| **VM** | `flowindex-bundler` (GCE e2-micro, COS, us-central1-a) |
| **IP** | `136.112.57.126` (static) |
| **DNS** | `bundler.flowindex.io` |
| **Network** | `flowindex-vpc` (internal: `10.128.0.6`) |

## Deployed Contracts (CREATE2 — same on Testnet 545 & Mainnet 747)

| Contract | Address |
|----------|---------|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| CoinbaseSmartWallet (impl) | `0x3e3Ea3318aff863f051998239f4a7eE1554714Ea` |
| CoinbaseSmartWalletFactory | `0x69d8889778D1baAE4D9D84ad13367cBA570e46e6` |
| VerifyingPaymaster | `0x78c7b2f6313a7615504b28197b80abb9c6696395` |

## Wallet Addresses (shared across testnet & mainnet)

| Wallet | Address | Purpose |
|--------|---------|---------|
| Executor | `0x4E33289dC575167045d276bA7C5F56Fd6eB1D1Eb` | Submits bundle transactions |
| Utility | `0xbB13e9207935D5Cb4dFD7193dd21756292976c67` | Auto-refills executor |
| Paymaster Signer | `0xB9FB2E7B2635c6ee81020427f325d2655C07C97c` | Signs paymaster approvals |

## Services

| Container | Port | Chain | Service |
|-----------|------|-------|---------|
| `alto-testnet` | 4337 | 545 | Alto bundler (testnet RPC) |
| `alto-mainnet` | 4347 | 747 | Alto bundler (mainnet RPC) |
| `paymaster-testnet` | 4338 | 545 | Paymaster signer |
| `paymaster-mainnet` | 4348 | 747 | Paymaster signer |
| `caddy` | 443 | — | TLS + path routing |

## Setup

### 1. Environment

Copy `.env.example` to `.env` and fill in private keys:

```bash
cp .env.example .env
```

**Keys are stored in:**
- VM: `/mnt/stateful_partition/alto-bundler.env`
- GitHub Secrets (backup): `ALTO_EXECUTOR_PRIVATE_KEY`, `ALTO_UTILITY_PRIVATE_KEY`, `PAYMASTER_SIGNER_KEY`

### 2. Local Development

```bash
# Start bundler + paymaster via docker-compose (from repo root)
docker compose up alto-bundler -d

# Or run paymaster service directly
cd wallet/bundler
bun install
CHAIN_ID=545 bun run paymaster-service.ts
```

### 3. Verify

```bash
# Test testnet bundler
curl https://bundler.flowindex.io/545/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_supportedEntryPoints","id":1}'

# Test mainnet bundler
curl https://bundler.flowindex.io/747/rpc \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_supportedEntryPoints","id":1}'

# Test paymaster
curl https://bundler.flowindex.io/545/paymaster \
  -H 'Content-Type: application/json' \
  -d '{"userOp":{"sender":"0x...","nonce":"0x0",...}}'
```

### 4. VM Management

```bash
# SSH into bundler VM
gcloud compute ssh flowindex-bundler --zone=us-central1-a

# Check container logs
docker logs alto-testnet
docker logs alto-mainnet
docker logs paymaster-testnet
docker logs paymaster-mainnet
docker logs caddy

# Restart all services
docker restart alto-testnet alto-mainnet paymaster-testnet paymaster-mainnet
```

### 5. Funding

The executor wallet needs FLOW on both testnet and mainnet. The paymaster contract needs a deposit at the EntryPoint on each network.

```bash
# Check paymaster deposit at EntryPoint (testnet)
cast call 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "balanceOf(address)(uint256)" 0x78c7b2f6313a7615504b28197b80abb9c6696395 \
  --rpc-url https://testnet.evm.nodes.onflow.org

# Check paymaster deposit at EntryPoint (mainnet)
cast call 0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
  "balanceOf(address)(uint256)" 0x78c7b2f6313a7615504b28197b80abb9c6696395 \
  --rpc-url https://mainnet.evm.nodes.onflow.org
```

## Deployment

Deploy via `.github/workflows/deploy-infra.yml` (manual workflow_dispatch).

Inputs:
- `bundler` — Redeploy Alto instances (testnet + mainnet)
- `paymaster` — Redeploy paymaster instances (testnet + mainnet)
- `caddy` — Update Caddy routing config
- `all` — Redeploy everything

## Security

- Private keys are **never** committed to the repo (`.env` is gitignored)
- Keys stored on VM at `/mnt/stateful_partition/alto-bundler.env` (persistent across reboots)
- Keys backed up in GitHub Secrets
