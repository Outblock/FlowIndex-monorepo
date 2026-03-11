# Simulate — Transaction Simulation Service

## Structure

```
simulate/
├── frontend/     # TanStack Start landing page + playground UI
│   ├── app/      # React components, routes, lib
│   ├── server/   # Nitro server routes (proxies to backend /flow/v1/simulate)
│   └── Dockerfile
└── emulator/     # Flow Emulator in mainnet-fork mode
    ├── Dockerfile  # Builds emulator v1.16.3 from source
    └── start.sh    # GCE VM startup script
```

## Frontend

Interactive Cadence transaction simulator with CRT retro theme. Includes 5 templates (transfer, mint NFT, swap, deploy, stake) and a Monaco editor playground.

```bash
cd simulate/frontend
bun install
bun run dev      # Port 5174
bun run build    # Outputs to .output/
```

**Env:** `SIMULATOR_BACKEND_URL` (default: `http://localhost:8080`) — proxied via `/api/simulate`

## Emulator

Flow Emulator Docker image that forks mainnet state. Deployed to `flowindex-simulator` GCE VM.

- REST API: port 8888
- gRPC: port 3569
- Admin API: port 8080 (snapshots)

## Backend Handler

The Go handler that wraps the emulator lives in `backend/internal/simulator/` (not in this directory). It handles `/flow/v1/simulate` requests, manages snapshot isolation, and parses balance changes from events.
