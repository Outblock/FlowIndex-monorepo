# Flow Emulator Support for Runner — Design

**Goal:** Add local Flow Emulator as a third network option in Runner, enabling offline Cadence development with auto-signing and standard contract deployment.

**Approach:** Extend the existing mainnet/testnet network switcher with an `emulator` option that connects to `localhost:8888`, auto-signs with the emulator service account, and bootstraps standard contracts.

---

## 1. Network Config

- Add `'emulator'` to `FlowNetwork` type
- New entry in `NETWORK_CONFIG`:
  - `accessNode.api`: `http://localhost:8888`
  - Contract addresses: all point to service account `0xf8d6e0586b0a20c7`
- FCL configured the same way as mainnet/testnet via `configureFcl()`

## 2. Service Account Auto-Signer

- Emulator service account: `0xf8d6e0586b0a20c7`
- Built-in private key (public test key from Flow CLI, not secret)
- When network is `emulator`, signer auto-locks to service account
- Uses existing `executeCustodialTransaction()` path with a signing function built from the embedded key
- Signer selector UI grayed out / shows "Service Account" in emulator mode

## 3. Connection Health Check

- On switch to emulator, ping `GET http://localhost:8888/v1/blocks?height=sealed`
- Success → proceed normally
- Failure → show banner above editor: "Emulator not running. Start with: `flow emulator`"
- Retry every 5 seconds; auto-dismiss banner on success
- Visual indicator (green/red dot) next to network selector

## 4. Standard Contract Auto-Deploy

- After successful connection, check service account for standard contracts
- Deploy missing contracts: FungibleToken, NonFungibleToken, FlowToken, MetadataViews, FungibleTokenMetadataViews, ViewResolver, Burner, EVM
- Contract source bundled in runner (or fetched from known repos)
- Deployment progress shown in result panel
- Only runs once per emulator session (track deployed state in memory)

## 5. UI Changes

- Network selector: add "Emulator" option with local/terminal icon
- Signer selector: auto-lock to "Service Account" when on emulator
- Connection status indicator (green/red dot)
- Error banner for disconnected state with copy-able start command

## Decisions

- **Local emulator only** — user runs `flow emulator` themselves
- **Service account only** — no multi-account creation
- **Auto-deploy contracts** — no manual setup needed
- **Connection detection with guidance** — helpful error when emulator not running
