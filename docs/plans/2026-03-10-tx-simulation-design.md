# Flow Transaction Simulation (Pre-Execution Preview) — Design

**Goal:** Provide EVM-style transaction pre-execution for Flow — simulate a transaction against live mainnet state before signing, showing users what will happen (balance changes, events, errors).

**Approach:** Run a Flow Emulator in fork mode (`--fork mainnet`) on the GCP backend VM as a Docker container. Go backend exposes a `/flow/v1/simulate` API. Runner/Studio auto-simulates before sending, with option to skip.

---

## 1. Backend: Simulation API

### Endpoint

```
POST /flow/v1/simulate
```

**Request:**
```json
{
  "cadence": "transaction(amount: UFix64) { ... }",
  "arguments": [{ "type": "UFix64", "value": "10.0" }],
  "authorizers": ["0x1654653399040a61"],
  "payer": "0x1654653399040a61",
  "verbose": false
}
```

**Response (verbose=false):**
```json
{
  "success": true,
  "events": [
    { "type": "A.1654653399040a61.FlowToken.TokensWithdrawn", "values": {"amount": "10.0", "from": "0x1654653399040a61"} }
  ],
  "balanceChanges": [
    { "address": "0x1654653399040a61", "token": "FLOW", "before": "100.0", "after": "90.0", "delta": "-10.0" }
  ],
  "computationUsed": 42
}
```

**Response (verbose=true)** adds: `storageChanges`, `accountKeyChanges`, `contractChanges`, `rawEvents`.

**Error response:**
```json
{
  "success": false,
  "error": "execution reverted: insufficient balance",
  "computationUsed": 12
}
```

### Backend Package: `internal/simulator/`

- `manager.go` — Emulator process lifecycle (health check, restart)
- `client.go` — gRPC/REST client to emulator (submit tx, read results)
- `handler.go` — HTTP handler for `/flow/v1/simulate`
- `snapshot.go` — Snapshot management (save before simulate, revert after)

### Simulation Flow

1. Receive request, build unsigned `flow.TransactionBody`
2. Take emulator snapshot (named, e.g. `pre-sim-{uuid}`)
3. Submit tx via emulator REST API (skip-tx-validation means no real signature needed)
4. Wait for execution result (events, status)
5. Query balance changes: compare pre/post balances for authorizer + affected accounts (parsed from events)
6. Revert to snapshot
7. Return formatted result

---

## 2. Infrastructure

### Deployment: flowindex-backend VM

```
flowindex-backend VM (GCE)
├── backend container       (port 8080)
├── flow-simulator container (port 8888 REST + 3569 gRPC)  ← NEW
├── postgres container      (port 5432)
└── supabase containers     (ports 54321, 8101-8103)
```

- Backend calls emulator on localhost — zero network latency
- Emulator uses `--persist` with Docker volume for register cache across restarts
- Not exposed externally — only backend accesses it

### Docker Compose Service

```yaml
simulator:
  image: ghcr.io/onflow/flow-emulator:latest
  command: >
    emulator
    --fork-host access.mainnet.nodes.onflow.org:9000
    --skip-tx-validation
    --persist
    --chain-id flow-mainnet
    --rest-port 8888
    --grpc-port 3569
  volumes:
    - simulator-data:/root/.flow-emulator
  restart: unless-stopped
  network_mode: host
```

### GCP Deploy

- Add `simulator` to `docker-compose.yml` on backend VM
- Deploy script pulls `ghcr.io/onflow/flow-emulator:latest`
- Health check: `GET http://localhost:8888/v1/blocks?height=sealed`

---

## 3. Runner/Studio UX

### Auto-Simulate Flow

```
User writes Cadence tx → clicks Execute
    │
    ▼
Auto POST /flow/v1/simulate
    │
    ▼
Preview Panel:
┌──────────────────────────────┐
│  Transaction Preview          │
│                               │
│  ✅ Simulation successful     │
│                               │
│  Balance Changes:             │
│  📤 You: -10.0 FLOW          │
│  📥 0xe467...00df: +10.0 FLOW│
│                               │
│  Events (2):                  │
│  • TokensWithdrawn            │
│  • TokensDeposited            │
│                               │
│  Gas: 42 computation units    │
│                               │
│  [Cancel]  [Confirm & Send]   │
└──────────────────────────────┘
```

- Simulation failure shows error + allows "Send Anyway" option
- Loading state: spinner "Simulating transaction..."
- Default view is simple; "Details" expands to full events/state

### Settings

```
Runner Settings
├── ...existing settings...
└── Transaction Preview
    ├── [✓] Simulate before sending (default: on)
    └── Preview detail: [Simple ▾] / Detailed
```

- Toggle off → Execute sends directly, no simulation step
- Stored in localStorage, persists per user

---

## 4. Key Technical Details

### Emulator Fork Mode

- `--fork-host`: Connects to mainnet Access Node, lazy-loads registers on demand
- `--skip-tx-validation`: Skips signature checks — can simulate as any account
- `--persist`: Stores cached registers in SQLite for reuse across restarts
- Snapshots: Emulator supports named snapshots via admin API for state revert

### Balance Change Detection

Parse events from simulation result to detect balance changes:
- `FlowToken.TokensWithdrawn` / `FlowToken.TokensDeposited` → FLOW balance changes
- `FungibleToken.Withdrawn` / `FungibleToken.Deposited` → FT balance changes
- For verbose mode, query account state before/after for full diff

### Latency Budget

- Cold (first request, register cache miss): ~2-5s
- Warm (cached registers): ~200-500ms
- Acceptable for pre-execution preview (user expects a brief pause)

---

## Decisions

- **Emulator fork mode** over RemoteDebugger — simpler, maintained by Flow team, no flow-go version coupling
- **GCP backend VM** — co-located with backend for zero latency, single management plane
- **Auto-simulate by default** — best UX, with settings toggle to skip
- **Tiered response** — simple view for most users, verbose for developers
- **Snapshot revert** — each simulation is isolated, no state accumulation
