# MCP Server Auth Design

**Date:** 2026-03-07
**Status:** Approved

## Overview

Add API key authentication and rate limiting to the FlowIndex AI MCP server (`ai/chat/mcp_server.py`). Two tiers: an internal admin key (env var, no limits) and developer keys (validated against Go backend's existing API key system, rate limited).

## Decisions

- **Reuse existing API keys** from `/developer/keys` (Svix-based, Go backend manages). No new tables or UI.
- **Admin key** via `MCP_ADMIN_KEY` env var — internal use, no rate limit
- **Rate limit**: 60 req/min per developer key, in-memory sliding window
- **No usage logging** for now — just auth + rate limit
- **Auth toggle**: `MCP_AUTH_ENABLED` env var, default true, can disable for local dev

## Architecture

```
Client (Claude Desktop / Claude Code / Cursor / etc.)
  │
  │  Authorization: Bearer <key>
  ▼
MCP Server (mcp_server.py, port 8085)
  │
  ├── MCP_AUTH_ENABLED=false?  → skip auth, allow all
  │
  ├── No key?  → 401 Unauthorized
  │
  ├── key == MCP_ADMIN_KEY?  → allow, no rate limit
  │
  └── else → HTTP call to Go backend to validate developer key
              ├── valid → rate limit check (sliding window, 60/min)
              │            ├── under limit → allow
              │            └── over limit → 429 Too Many Requests
              └── invalid → 401 Unauthorized
```

## Changes

### 1. `ai/chat/config.py` — New config vars

```python
MCP_ADMIN_KEY = os.environ.get("MCP_ADMIN_KEY", "")
MCP_AUTH_ENABLED = os.environ.get("MCP_AUTH_ENABLED", "true").lower() in ("true", "1", "yes")
MCP_RATE_LIMIT = int(os.environ.get("MCP_RATE_LIMIT", "60"))  # req/min per key
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8080")  # Go backend for key validation
```

### 2. `ai/chat/mcp_server.py` — Auth middleware

FastMCP supports adding auth dependencies. The middleware:

1. Extracts key from `Authorization: Bearer <key>` header
2. Checks against admin key (env var)
3. If not admin, validates against Go backend via HTTP
4. Applies sliding window rate limit (in-memory dict of `{key: [timestamps]}`)
5. Returns appropriate HTTP error codes (401, 429)

### 3. Go backend — No changes needed

Existing API key validation endpoint is reused. The MCP server calls it to verify developer keys.

## Client Configuration

### Claude Desktop (via mcp-remote)

```json
{
  "mcpServers": {
    "flow-ai": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://ai.flowindex.io/mcp"],
      "env": {
        "MCP_HEADERS": "{\"Authorization\":\"Bearer fi_xxxxxxxxxxxx\"}"
      }
    }
  }
}
```

### Claude Code (.claude/settings.json or .mcp.json)

```json
{
  "mcpServers": {
    "flow-ai": {
      "type": "streamable-http",
      "url": "https://ai.flowindex.io/mcp",
      "headers": {
        "Authorization": "Bearer fi_xxxxxxxxxxxx"
      }
    }
  }
}
```

### Internal (admin key, no rate limit)

Same format but with admin key from `MCP_ADMIN_KEY` env var.

## Rate Limiter Design

In-memory sliding window per key:

```python
# Dict of {api_key: deque([timestamp, ...])}
# On each request: remove timestamps older than 60s, check len < limit
```

- Resets on server restart (acceptable for this use case)
- No persistence needed
- Admin key bypasses entirely

## Not Doing

- No new database tables
- No new UI for MCP-specific key management
- No persistent usage logging
- No per-tier differentiated rate limits (all dev keys get same limit)
- No OAuth flow (simple Bearer token auth only)

## Future Upgrades

- Per-tier rate limits (free/pro/enterprise)
- Persistent usage analytics (write to DB)
- Per-tool rate limits (e.g. SQL tools more expensive than resource reads)
- Key scoping (restrict which tools a key can access)
