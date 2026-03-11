# Simulate

`simulate/` is a standalone Flow transaction simulation stack. The goal is not to approximate a result in application code, but to execute the user's Cadence transaction inside a **mainnet-forked** Flow Emulator and then reshape the output into something the UI can consume directly.

At a high level:

1. Run a custom Flow Emulator in mainnet fork mode.
2. Put a thin Go API in front of it for serialization, snapshots, warmup, watchdog recovery, and request adaptation.
3. Let the frontend focus on editing Cadence, submitting requests, and decoding raw events into a readable summary.

## Directory Layout

```text
simulate/
├── api/         # Go HTTP API that talks directly to the emulator REST/Admin APIs
├── emulator/    # Forked Flow Emulator image and startup script
├── frontend/    # Playground UI and server routes
└── README.md
```

More specifically:

- `api/main.go`
  - Starts `POST /api/simulate` and `GET /health`
- `api/client.go`
  - Translates simulation requests into emulator REST calls
  - Handles `/v1/transactions`, `/v1/transaction_results/:id`, and `/emulator/snapshots`
- `api/handler.go`
  - Main simulation flow, warmup, serialized execution, best-effort snapshot isolation, watchdog recovery
- `emulator/Dockerfile`
  - Builds our forked Flow Emulator and starts it in mainnet fork mode
- `emulator/start.sh`
  - GCE VM startup script
- `frontend/server/routes/api/simulate.post.ts`
  - Proxies to the simulator API and decodes events via `@flowindex/event-decoder`

## Architecture

```text
Browser
  -> simulate/frontend
  -> frontend server route (/api/simulate)
  -> simulate/api
  -> Flow Emulator (mainnet fork)
  -> raw tx result + events
  -> event-decoder summary
  -> Browser
```

Container/port mapping:

- `simulate` frontend: `5175 -> 3000`
- `simulator-api`: `9090`
- `simulator` emulator REST: `8888`
- `simulator` emulator gRPC: `3569`
- `simulator` emulator admin: `8080`, exposed as host port `18080` in `docker-compose`

See [docker-compose.yml](/Users/hao/clawd/agents/fw-cs/flowscan-codex/docker-compose.yml#L297).

## How a Simulation Request Works

### 1. The frontend sends requests to its own server route

The browser does not talk to the emulator directly, and it does not talk to the Go API directly either. It first hits the frontend server routes:

- [simulate.post.ts](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/frontend/server/routes/api/simulate.post.ts)
- [raw.post.ts](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/frontend/server/routes/api/simulate/raw.post.ts)

This gives us two benefits:

- The browser does not need to know the internal `SIMULATOR_BACKEND_URL`
- The frontend server can decode raw events into higher-level summaries, transfers, and tags

### 2. The Go API converts the request into an emulator transaction

In [client.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/client.go#L164), `SendTransaction` does the heavy lifting:

- Base64-encodes the Cadence script before posting to emulator `/v1/transactions`
- Base64-encodes each argument
- Fills `reference_block_id`
- Builds `proposal_key`, `payer`, and `authorizers`
- Generates a syntactically valid dummy ECDSA P256 signature

That dummy signature works because the emulator runs with `--skip-tx-validation`. In practice that means:

- The signature is not truly verified
- The request still has to look like a properly-formed Flow transaction

That is why the code still generates signatures instead of leaving them empty.

### 3. Why arbitrary mainnet authorizers work

The emulator runs in mainnet fork mode:

- `--fork-host access.mainnet.nodes.onflow.org:9000`
- `--chain-id mainnet`
- `--skip-tx-validation`

See [simulate/emulator/Dockerfile](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/emulator/Dockerfile#L22).

This means:

- The FVM sees account state, contract code, and storage from mainnet fork state
- The authorizer can be any mainnet address
- No private key is required for that address

There is one deliberate tradeoff:

- `authorizers` stay as provided by the user
- `payer` is forced to the emulator service account `e467b9dd11fa00df`

See [handler.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/handler.go#L415).

This is intentional because the payer only affects fee payment. It matters much less for transaction logic, but allowing arbitrary payer state would trigger extra remote state fetches and slow down simulations noticeably.

### 4. Why execution is serialized

The Flow Emulator only handles one block execution reliably at a time. This implementation does not try to hide that. Instead, it accepts the constraint and makes it explicit:

- The handler owns a global `sync.Mutex`
- Every request acquires the lock before simulation
- The code explicitly waits for block readiness both before and after sending a transaction

Relevant code:

- [handler.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/handler.go#L421)
- [client.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/client.go#L374)

This is mainly there to avoid the common emulator race:

`pending block ... is currently being executed`

It is not elegant, but it is practical and stable.

### 5. Best-effort state isolation with snapshots

Before each simulation, the handler tries to:

1. `CreateSnapshot`
2. Execute the transaction
3. `RevertSnapshot`

Relevant code:

- [client.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/client.go#L409)
- [handler.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/handler.go#L428)

This is **best effort**, not hard isolation. In fork mode, snapshot behavior depends on emulator/admin API behavior and current runtime state. The current strategy is:

- Use snapshots when they succeed
- Do not fail the entire simulation if snapshot creation is unavailable

### 6. Why warmup exists

The first access to a contract or account storage on a mainnet fork can be slow, because the emulator has to fetch state lazily from the remote access node.

To reduce first-request latency, the service proactively runs warmup transactions at startup and on a schedule. These warmups pre-touch:

- Core token contracts
- NFT / metadata contracts
- Staking contracts
- EVM / bridge contracts
- Hybrid custody contracts
- Naming / utility contracts
- Misc contracts
- FlowToken vault storage for common signer addresses

See [handler.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/handler.go#L181).

Important implementation details:

- One warmup pass runs immediately at startup
- Another pass runs every hour
- Each warmup transaction gets its own 45s timeout
- The mutex is only held for one warmup transaction at a time, not for the full warmup sequence

That prevents warmup from blocking real user traffic for minutes.

### 7. Why there is a watchdog

Fork-mode emulator instances can occasionally get stuck on a pending block or a slow remote state fetch. The API process therefore runs a watchdog:

- Poll sealed block height every 10 seconds
- If there is no progress for longer than `STUCK_TIMEOUT`, run `docker restart <container>`
- Once the emulator is healthy again, rerun warmup

Code lives in [handler.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/handler.go#L96).

This is also why `simulator-api` mounts the Docker socket:

```yaml
- /var/run/docker.sock:/var/run/docker.sock
```

## How Results Are Produced

The Go API returns a relatively low-level result:

- success / error
- raw events
- computation used
- balance changes

`balance_changes` is a lightweight API-side extraction from emitted events. The logic is in [handler.go](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/api/handler.go#L470).

The richer UI summary is produced one layer later. The frontend server route feeds raw events into `@flowindex/event-decoder` and returns:

- `summary`
- `summaryItems`
- FT / NFT transfers
- EVM executions
- system / defi / staking events
- fee / tags

Implementation: [simulate.post.ts](/Users/hao/clawd/agents/fw-cs/flowscan-codex/simulate/frontend/server/routes/api/simulate.post.ts#L40).

So in practice:

- `simulate/api` is responsible for **real execution**
- `simulate/frontend` is responsible for **human-friendly presentation**

## Local Development

### Run the full stack with docker compose

From the project root:

```bash
docker compose up --build simulator simulator-api simulate
```

After startup:

- Emulator REST: `http://localhost:8888`
- Emulator Admin: `http://localhost:18080`
- Simulator API: `http://localhost:9090`
- Frontend: `http://localhost:5175`

### Run the API by itself

```bash
cd simulate/api
go run .
```

Common environment variables:

- `EMULATOR_URL`
- `EMULATOR_ADMIN_URL`
- `PORT`
- `CORS_ORIGINS`
- `EMULATOR_CONTAINER`
- `STUCK_TIMEOUT`

### Run the frontend by itself

```bash
cd simulate/frontend
bun install
bun run dev
```

The default Vite dev port is `http://localhost:5174`.  
If you use `docker compose`, the exposed frontend port is `http://localhost:5175`.

Common environment variable:

- `SIMULATOR_BACKEND_URL`

## Deployment

This directory contains deployment artifacts for each layer:

- `simulate/emulator/Dockerfile`
  - Builds the forked Flow Emulator image
- `simulate/emulator/start.sh`
  - Pulls and restarts the `simulator` container on the GCE VM

The API and frontend each have their own Dockerfiles as well, so they can be deployed independently or together via the monorepo `docker-compose.yml`.

## Why Not Use the Access API for Static Analysis

Because this is **transaction simulation**, not a read-only script query.

A real transaction can involve:

- resource movement / destruction
- storage writes
- capability borrows
- event emission
- fee and computation accounting

Those behaviors are much better modeled by actually executing the transaction in an FVM environment than by trying to reconstruct the outcome in application code.

## Known Limitations

1. This is simulation on forked state, not an on-chain guarantee. Mainnet keeps moving.
2. The current setup is single-emulator and serialized. It is suitable for a playground or API trial path, not for high-concurrency batch execution.
3. Snapshot support is best effort and not guaranteed for every fork-mode state.
4. Watchdog recovery relies on `docker restart`, which assumes the runtime environment can access the Docker socket.
5. Correctness still depends heavily on the quality of the forked emulator implementation, especially around remote register fetch, caching, and capability/slab reads.

## One-Line Summary

`simulate/` is effectively:

**a mainnet-forked Flow Emulator for real transaction execution, a thin Go API to make it operationally stable, and a frontend layer that turns raw execution output into something users can actually read.**
