# Chat Session Persistence & Sharing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session persistence and public sharing to the AI chat widget and web app, so logged-in users can revisit conversations and share them via public links.

**Architecture:** REST API endpoints on the existing Next.js app (`ai/chat/web/`) backed by the existing Supabase `chat_sessions`/`chat_messages` tables. Frontend widget passes Supabase JWT for auth. Public share pages use service-role client. No new services or databases.

**Tech Stack:** Next.js 16 API routes, Supabase (PostgreSQL + auth), `@supabase/ssr`, React 19, `@ai-sdk/react`

**Spec:** `docs/superpowers/specs/2026-03-14-chat-sessions-and-sharing-design.md`

---

## Chunk 1: Schema Migration + Session API

### Task 1: Schema Migration

**Files:**
- Modify: `ai/chat/web/supabase/migration.sql`

- [ ] **Step 1: Add new columns and indexes to migration.sql**

Append to the end of the existing file:

```sql
-- ============================================================
-- Migration: Chat session persistence & sharing (2026-03-14)
-- ============================================================

-- Extend chat_sessions
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS share_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz;

-- Extend chat_messages with generic tool storage
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS tool_calls jsonb,
  ADD COLUMN IF NOT EXISTS tool_results jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb;

-- Widen role constraint to support tool/system messages from AI SDK
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_role_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_role_check
  CHECK (role IN ('user', 'assistant', 'tool', 'system'));

-- Index for share lookups
CREATE INDEX IF NOT EXISTS idx_chat_sessions_share_id
  ON public.chat_sessions(share_id) WHERE share_id IS NOT NULL;

-- Index for user session listing (if not already present)
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
  ON public.chat_sessions(user_id, updated_at DESC);
```

- [ ] **Step 2: Verify migration syntax**

Run: `cd ai/chat/web && cat supabase/migration.sql`

Verify the appended SQL is valid and doesn't duplicate existing statements.

- [ ] **Step 3: Commit**

```bash
git add ai/chat/web/supabase/migration.sql
git commit -m "feat(ai): add schema migration for chat sessions & sharing"
```

---

### Task 2: Auth Helper for API Routes

**Files:**
- Create: `ai/chat/web/lib/api-auth.ts`

The session API routes need to validate JWTs and extract user IDs. Create a shared helper.

- [ ] **Step 1: Create api-auth.ts**

```typescript
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

/**
 * Authenticate a request using Supabase JWT.
 * Checks Authorization header first (for cross-origin widget calls),
 * then falls back to cookie-based auth (for same-origin web app).
 * Returns user or null.
 */
export async function authenticateRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  }

  // Fall back to cookie auth (same-origin requests)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.SUPABASE_URL_INTERNAL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Create a service-role Supabase client.
 * Bypasses RLS — used by all API routes (since cross-origin Bearer token
 * requests have no cookies, cookie-based clients won't work).
 * Authorization is enforced via explicit .eq("user_id", user.id) filters.
 */
export function createServiceClient() {
  return createClient(
    process.env.SUPABASE_URL_INTERNAL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

- [ ] **Step 2: Verify env vars exist**

Check that `SUPABASE_SERVICE_ROLE_KEY` is documented. Read `ai/chat/web/.env.local` or `.env.example` if it exists. If not, note that this env var must be set in deployment.

- [ ] **Step 3: Commit**

```bash
git add ai/chat/web/lib/api-auth.ts
git commit -m "feat(ai): add auth helper for session API routes"
```

---

### Task 3: CORS Middleware for Session Routes

**Files:**
- Modify: `ai/chat/web/middleware.ts`
- Modify: `ai/chat/web/next.config.ts`

- [ ] **Step 1: Add CORS headers to next.config.ts**

The existing config has CORS for `/api/:path*` with only `GET, POST, OPTIONS` and `Content-Type`. Update to include session API needs:

In `ai/chat/web/next.config.ts`, find the existing `headers()` function and update the `/api/:path*` headers:

Since `Access-Control-Allow-Origin` doesn't support multiple values and we need both `flowindex.io` and `www.flowindex.io`, use **middleware** for dynamic origin checking instead of static `next.config.ts` headers.

In `ai/chat/web/middleware.ts`, add a CORS helper at the top:

```typescript
const ALLOWED_ORIGINS = new Set([
  "https://flowindex.io",
  "https://www.flowindex.io",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
```

Then in the middleware function, handle CORS preflight for both `/api/sessions` and `/api/share`:

```typescript
const isSessionApi = request.nextUrl.pathname.startsWith("/api/sessions") ||
                     request.nextUrl.pathname.startsWith("/api/share");

if (isSessionApi) {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }
  // For non-preflight, add CORS headers to the response
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    response.headers.set(key, value);
  }
  return response;
}
```

No changes needed in `next.config.ts` for session routes — middleware handles everything.

- [ ] **Step 2: Exclude session routes from middleware auth check**

In `ai/chat/web/middleware.ts`, the matcher excludes certain routes. The session API routes handle their own auth via `authenticateRequest()`. Add exclusions to the matcher config or handle OPTIONS preflight:

The CORS handling (including OPTIONS preflight) is fully covered by the middleware code above. No additional changes needed here.

- [ ] **Step 3: Verify by checking the full middleware file**

Read `ai/chat/web/middleware.ts` to confirm the change integrates correctly with the existing fi_auth cookie fallback logic.

- [ ] **Step 4: Commit**

```bash
git add ai/chat/web/next.config.ts ai/chat/web/middleware.ts
git commit -m "feat(ai): add CORS config for session API routes"
```

---

### Task 4: Session CRUD API Routes

**Files:**
- Create: `ai/chat/web/app/api/sessions/route.ts` (GET list + POST create)
- Create: `ai/chat/web/app/api/sessions/[id]/route.ts` (GET one + PATCH rename + DELETE)

- [ ] **Step 1: Create GET /api/sessions + POST /api/sessions**

File: `ai/chat/web/app/api/sessions/route.ts`

All API routes use `createServiceClient()` (service-role, bypasses RLS) instead of cookie-based clients. This is necessary because cross-origin widget requests send Bearer tokens, not cookies. Authorization is enforced via explicit `.eq("user_id", user.id)` filters on every query.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/api-auth";

// GET /api/sessions — list user's sessions
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, title, source, share_id, shared_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}

// POST /api/sessions — create a new session
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, title, source = "web" } = body;

  const supabase = createServiceClient();

  // Enforce 50-session limit
  const { count, error: countError } = await supabase
    .from("chat_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
  if ((count ?? 0) >= 50) {
    return NextResponse.json({ error: "Session limit reached (50). Delete old sessions to create new ones." }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .upsert({
      id: id || undefined,
      user_id: user.id,
      title: (title || "New chat").slice(0, 80),
      source,
    }, { onConflict: "id" })
    .select("id, title, source, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data }, { status: 201 });
}
```

- [ ] **Step 2: Create GET/PATCH/DELETE /api/sessions/[id]**

File: `ai/chat/web/app/api/sessions/[id]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

// GET /api/sessions/:id — get session + messages
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, title, source, share_id, shared_at, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: messages, error: msgError } = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls, tool_results, attachments, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  return NextResponse.json({ session, messages });
}

// PATCH /api/sessions/:id — rename session
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title } = body;
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ title: title.slice(0, 80) })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title")
    .single();

  if (error || !data) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json({ session: data });
}

// DELETE /api/sessions/:id — delete session + messages
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // Messages auto-delete via ON DELETE CASCADE on the FK constraint
  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Test with curl (after running dev server)**

```bash
cd ai/chat/web && bun run dev &

# List sessions (should return 401 without auth)
curl -s http://localhost:3001/api/sessions | jq .

# With a valid token (get from browser devtools):
# curl -s -H "Authorization: Bearer <token>" http://localhost:3001/api/sessions | jq .
```

- [ ] **Step 4: Commit**

```bash
git add ai/chat/web/app/api/sessions/
git commit -m "feat(ai): add session CRUD API routes"
```

---

### Task 5: Message Append API Route

**Files:**
- Create: `ai/chat/web/app/api/sessions/[id]/messages/route.ts`

- [ ] **Step 1: Create POST /api/sessions/:id/messages**

File: `ai/chat/web/app/api/sessions/[id]/messages/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/sessions/:id/messages — append messages
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { messages, title, source } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Check if session exists; auto-create if not
  const { data: existingSession } = await supabase
    .from("chat_sessions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existingSession) {
    // Enforce 50-session limit on auto-create
    const { count } = await supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((count ?? 0) >= 50) {
      return NextResponse.json({
        error: "Session limit reached (50). Delete old sessions to create new ones."
      }, { status: 409 });
    }

    // Auto-create session
    const autoTitle = messages.find((m: any) => m.role === "user")?.content;
    const { error: createError } = await supabase
      .from("chat_sessions")
      .insert({
        id,
        user_id: user.id,
        title: (title || (typeof autoTitle === "string" ? autoTitle : "New chat")).slice(0, 80),
        source: source || "web",
      });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }
  }

  // Enforce 200-message limit
  const { count: msgCount } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);

  if ((msgCount ?? 0) + messages.length > 200) {
    return NextResponse.json({
      error: "Message limit reached (200 per session)."
    }, { status: 409 });
  }

  // Insert messages
  const rows = messages.map((m: any) => ({
    session_id: id,
    role: m.role,
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    tool_calls: m.tool_calls || null,
    tool_results: m.tool_results || null,
    attachments: m.attachments || null,
  }));

  const { error: insertError } = await supabase
    .from("chat_messages")
    .insert(rows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Update session timestamp
  await supabase
    .from("chat_sessions")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, added: messages.length });
}
```

- [ ] **Step 2: Commit**

```bash
git add ai/chat/web/app/api/sessions/[id]/messages/
git commit -m "feat(ai): add message append API route with auto-create"
```

---

### Task 6: Share / Unshare API Routes

**Files:**
- Create: `ai/chat/web/app/api/sessions/[id]/share/route.ts`

- [ ] **Step 1: Create POST + DELETE /api/sessions/:id/share**

File: `ai/chat/web/app/api/sessions/[id]/share/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/api-auth";
import crypto from "crypto";

function generateShareId(): string {
  // 8-char alphanumeric
  return crypto.randomBytes(6).toString("base64url").slice(0, 8);
}

type Params = { params: Promise<{ id: string }> };

// POST /api/sessions/:id/share — generate share link
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();

  // Check session exists and belongs to user
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, share_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  // Idempotent: return existing share link
  if (session.share_id) {
    return NextResponse.json({
      share_url: `https://ai.flowindex.io/s/${session.share_id}`,
      share_id: session.share_id,
    });
  }

  // Enforce 10 active share links per user
  const { count } = await supabase
    .from("chat_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("share_id", "is", null);

  if ((count ?? 0) >= 10) {
    return NextResponse.json({
      error: "Share limit reached (10). Revoke an existing share link first."
    }, { status: 409 });
  }

  // Generate share ID with retry on collision (up to 3 attempts)
  for (let attempt = 0; attempt < 3; attempt++) {
    const shareId = generateShareId();
    const { data, error } = await supabase
      .from("chat_sessions")
      .update({ share_id: shareId, shared_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("share_id")
      .single();

    if (!error && data) {
      return NextResponse.json({
        share_url: `https://ai.flowindex.io/s/${data.share_id}`,
        share_id: data.share_id,
      });
    }

    // If error is unique constraint violation, retry
    if (error?.code === "23505") continue;
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }

  return NextResponse.json({ error: "Failed to generate unique share ID" }, { status: 500 });
}

// DELETE /api/sessions/:id/share — revoke share link
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await authenticateRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({ share_id: null, shared_at: null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add ai/chat/web/app/api/sessions/[id]/share/
git commit -m "feat(ai): add share/unshare API routes"
```

---

### Task 7: Public Share API Route

**Files:**
- Create: `ai/chat/web/app/api/share/[shareId]/route.ts`

- [ ] **Step 1: Create GET /api/share/:shareId**

File: `ai/chat/web/app/api/share/[shareId]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api-auth";

type Params = { params: Promise<{ shareId: string }> };

// GET /api/share/:shareId — public read-only view
export async function GET(req: NextRequest, { params }: Params) {
  const { shareId } = await params;
  const supabase = createServiceClient();

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("id, title, source, shared_at")
    .eq("share_id", shareId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Shared session not found" }, { status: 404 });
  }

  const { data: messages, error: msgError } = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls, tool_results, attachments, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 });
  }

  // Return safe fields only (no user_id)
  return NextResponse.json({
    session: {
      title: session.title,
      source: session.source,
      shared_at: session.shared_at,
    },
    messages,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add ai/chat/web/app/api/share/
git commit -m "feat(ai): add public share API route"
```

---

## Chunk 2: AI Chat Web UI Updates

### Task 8: Migrate chat-store.ts to API Endpoints

**Files:**
- Modify: `ai/chat/web/lib/chat-store.ts`

The current `chat-store.ts` uses direct Supabase client calls. Migrate authenticated user flows to the new `/api/sessions/*` endpoints. Keep localStorage fallback for anonymous users unchanged.

- [ ] **Step 1: Read current chat-store.ts**

Read the full file to understand existing localStorage logic (lines 18-38) that must be preserved.

- [ ] **Step 2: Rewrite chat-store.ts**

Replace the Supabase-direct calls with fetch calls to the API. The API handles auth via cookies (same-origin) so no explicit token needed from the web app.

```typescript
// Types
export interface ChatSession {
  id: string;
  title: string;
  source?: string;
  share_id?: string | null;
  shared_at?: string | null;
  updated_at: string;
  created_at?: string;
}

export interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  tool_calls?: any;
  tool_results?: any;
  attachments?: any;
  created_at?: string;
  // Legacy columns (kept for backward compat with existing data)
  sql?: string;
  result?: any;
  error?: string;
}

// ---- localStorage fallback for anonymous users (unchanged) ----

const LOCAL_SESSIONS_KEY = "chat_sessions";
const LOCAL_MSG_PREFIX = "chat_msgs_";
const MAX_LOCAL_SESSIONS = 20;

function getLocalSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function setLocalSessions(sessions: ChatSession[]) {
  localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_LOCAL_SESSIONS)));
}

function getLocalMessages(sessionId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_MSG_PREFIX}${sessionId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function setLocalMessages(sessionId: string, messages: ChatMessage[]) {
  localStorage.setItem(`${LOCAL_MSG_PREFIX}${sessionId}`, JSON.stringify(messages));
}

// ---- API-backed functions (authenticated users) ----

export async function listSessions(userId: string | null): Promise<ChatSession[]> {
  if (!userId) return getLocalSessions();

  const res = await fetch("/api/sessions");
  if (!res.ok) return [];
  const { sessions } = await res.json();
  return sessions;
}

export async function loadMessages(sessionId: string, userId: string | null): Promise<ChatMessage[]> {
  if (!userId) return getLocalMessages(sessionId);

  const res = await fetch(`/api/sessions/${sessionId}`);
  if (!res.ok) return [];
  const { messages } = await res.json();
  return messages;
}

/**
 * Save full session to localStorage (anonymous) or append new messages via API (authenticated).
 * For API mode, only pass NEW messages — the endpoint appends, not replaces.
 */
export async function saveSession(
  sessionId: string,
  title: string,
  messages: ChatMessage[],
  userId: string | null,
  source: string = "web"
): Promise<void> {
  if (!userId) {
    // localStorage fallback — full replace (existing behavior)
    const sessions = getLocalSessions();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    const session: ChatSession = {
      id: sessionId,
      title: title.slice(0, 80),
      updated_at: new Date().toISOString(),
    };
    if (idx >= 0) sessions[idx] = session;
    else sessions.unshift(session);
    setLocalSessions(sessions);
    setLocalMessages(sessionId, messages);
    return;
  }

  // API mode — append only the NEW messages passed in
  await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, title, source }),
  });
}

/**
 * Append new messages to an existing session via API.
 * This is the primary save method for authenticated users.
 * Callers should pass only the new user + assistant message pair.
 */
export async function appendMessages(
  sessionId: string,
  newMessages: ChatMessage[],
  title: string,
  source: string = "web",
  authToken?: string,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  await fetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages: newMessages, title, source }),
  });
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  await fetch(`/api/sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function deleteSession(sessionId: string, userId: string | null): Promise<void> {
  if (!userId) {
    const sessions = getLocalSessions().filter((s) => s.id !== sessionId);
    setLocalSessions(sessions);
    localStorage.removeItem(`${LOCAL_MSG_PREFIX}${sessionId}`);
    return;
  }

  await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
}

// ---- Share functions (new) ----

export async function shareSession(sessionId: string): Promise<{ share_url: string; share_id: string } | null> {
  const res = await fetch(`/api/sessions/${sessionId}/share`, { method: "POST" });
  if (!res.ok) return null;
  return res.json();
}

export async function unshareSession(sessionId: string): Promise<boolean> {
  const res = await fetch(`/api/sessions/${sessionId}/share`, { method: "DELETE" });
  return res.ok;
}
```

- [ ] **Step 3: Verify the web app still compiles**

```bash
cd ai/chat/web && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add ai/chat/web/lib/chat-store.ts
git commit -m "refactor(ai): migrate chat-store to session API endpoints"
```

---

### Task 9: Share Button + Dialog in Chat Component

**Files:**
- Modify: `ai/chat/web/components/chat.tsx`

Add a share button in the chat header area and a share dialog.

- [ ] **Step 1: Read current chat.tsx header area**

Read `ai/chat/web/components/chat.tsx` focusing on the header/toolbar area to find the right insertion point. Look for the model selector and any existing header buttons.

- [ ] **Step 2: Add share imports and state**

At the top of `chat.tsx`, add:

```typescript
import { shareSession, unshareSession } from "@/lib/chat-store";
import { Share2, Link, X } from "lucide-react";
```

Inside the chat component, add state:

```typescript
const [shareDialogOpen, setShareDialogOpen] = useState(false);
const [shareUrl, setShareUrl] = useState<string | null>(null);
const [shareLoading, setShareLoading] = useState(false);
```

- [ ] **Step 3: Add share handler functions**

```typescript
const handleShare = async () => {
  if (!sessionId) return;
  setShareLoading(true);
  const result = await shareSession(sessionId);
  if (result) setShareUrl(result.share_url);
  setShareLoading(false);
  setShareDialogOpen(true);
};

const handleUnshare = async () => {
  if (!sessionId) return;
  await unshareSession(sessionId);
  setShareUrl(null);
  setShareDialogOpen(false);
};

const handleCopyShareUrl = () => {
  if (shareUrl) {
    navigator.clipboard.writeText(shareUrl);
  }
};
```

- [ ] **Step 4: Add share button to the toolbar/header area**

Find the model selector area in the composer toolbar. Add a share button next to it:

```tsx
{userId && messages.length > 0 && (
  <button
    onClick={handleShare}
    className="flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
    title="Share conversation"
  >
    <Share2 className="w-3.5 h-3.5" />
    Share
  </button>
)}
```

- [ ] **Step 5: Add share dialog**

Add a dialog/popover component. Use a simple modal overlay:

```tsx
{shareDialogOpen && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShareDialogOpen(false)}>
    <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4 border border-zinc-700" onClick={(e) => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">Share Conversation</h3>
        <button onClick={() => setShareDialogOpen(false)} className="text-zinc-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
      <p className="text-sm text-zinc-400 mb-4">
        Anyone with the link can view this conversation (read-only). Tool outputs and results will be visible.
      </p>
      {shareUrl ? (
        <>
          <div className="flex gap-2 mb-4">
            <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-sky-400 font-mono truncate">
              {shareUrl}
            </div>
            <button
              onClick={handleCopyShareUrl}
              className="px-4 py-2 bg-sky-400 text-black rounded-lg text-sm font-semibold hover:bg-sky-300 transition-colors"
            >
              Copy
            </button>
          </div>
          <div className="text-center">
            <button onClick={handleUnshare} className="text-sm text-red-400 hover:text-red-300">
              Revoke link
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={handleShare}
          disabled={shareLoading}
          className="w-full px-4 py-2 bg-sky-400 text-black rounded-lg text-sm font-semibold hover:bg-sky-300 transition-colors disabled:opacity-50"
        >
          {shareLoading ? "Generating..." : "Generate share link"}
        </button>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify build**

```bash
cd ai/chat/web && bun run build
```

- [ ] **Step 7: Commit**

```bash
git add ai/chat/web/components/chat.tsx
git commit -m "feat(ai): add share button and dialog to chat component"
```

---

### Task 10: Source Badge in Sidebar

**Files:**
- Modify: `ai/chat/web/components/sidebar.tsx`

- [ ] **Step 1: Read current sidebar session list rendering**

Read `ai/chat/web/components/sidebar.tsx` to find the session list item markup (around lines 92-116).

- [ ] **Step 2: Add source badge next to session title**

In the session list item, after the title text, add:

```tsx
{session.source === "widget" && (
  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-zinc-700 text-zinc-400 rounded">
    widget
  </span>
)}
```

This only shows a badge for widget-origin sessions. Web sessions (the default) don't need a badge.

- [ ] **Step 3: Commit**

```bash
git add ai/chat/web/components/sidebar.tsx
git commit -m "feat(ai): add source badge to sidebar session list"
```

---

## Chunk 3: Public Share Page

### Task 11: Public Share Page (SSR)

**Files:**
- Create: `ai/chat/web/app/s/[shareId]/page.tsx`

- [ ] **Step 1: Create the share page**

This is a server-rendered page that fetches shared session data and renders it read-only.

File: `ai/chat/web/app/s/[shareId]/page.tsx`

```tsx
import { createServiceClient } from "@/lib/api-auth";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import SharePageClient from "./SharePageClient";

type Params = { params: Promise<{ shareId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { shareId } = await params;
  const supabase = createServiceClient();
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("title")
    .eq("share_id", shareId)
    .single();

  return {
    title: session?.title ? `${session.title} — FlowIndex AI` : "Shared Conversation — FlowIndex AI",
    description: "A shared AI conversation on FlowIndex",
  };
}

export default async function SharePage({ params }: Params) {
  const { shareId } = await params;
  const supabase = createServiceClient();

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, title, source, shared_at")
    .eq("share_id", shareId)
    .single();

  if (!session) notFound();

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls, tool_results, attachments, created_at")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });

  return (
    <SharePageClient
      session={{ title: session.title, source: session.source, shared_at: session.shared_at }}
      messages={messages || []}
    />
  );
}
```

- [ ] **Step 2: Create the client component for rendering**

File: `ai/chat/web/app/s/[shareId]/SharePageClient.tsx`

```tsx
"use client";

interface SharedMessage {
  id: string;
  role: string;
  content: string;
  tool_calls?: any;
  tool_results?: any;
  attachments?: any;
  created_at: string;
}

interface SharePageClientProps {
  session: { title: string; source: string; shared_at: string };
  messages: SharedMessage[];
}

export default function SharePageClient({ session, messages }: SharePageClientProps) {
  return (
    <div className="min-h-screen bg-[#0f0f23] text-zinc-200">
      {/* Top banner */}
      <div className="bg-[#1a1a2e] border-b border-zinc-800 px-5 py-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sky-400">FlowIndex AI</span>
          <span className="text-zinc-500 text-sm">Shared conversation</span>
        </div>
        <a
          href="https://ai.flowindex.io"
          className="bg-sky-400 text-black px-3 py-1.5 rounded text-sm font-semibold hover:bg-sky-300 transition-colors"
        >
          Try FlowIndex AI →
        </a>
      </div>

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-5 py-8">
        <h1 className="text-xl font-semibold text-white mb-6">{session.title}</h1>

        {messages.map((msg) => (
          <div key={msg.id} className="mb-6">
            <div className="text-xs text-zinc-500 mb-1">
              {msg.role === "user" ? "User" : "Assistant"}
            </div>
            <div
              className={`rounded-lg p-4 ${
                msg.role === "user"
                  ? "bg-[#252540]"
                  : "bg-[#1e1e3a]"
              }`}
            >
              {/* Text content */}
              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Tool calls */}
              {msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.map((tc: any, i: number) => (
                <div key={i} className="mt-3 bg-[#15152a] border border-zinc-800 rounded-md overflow-hidden">
                  <div className="px-3 py-1.5 bg-[#1a1a30] border-b border-zinc-800 text-xs text-zinc-500 flex items-center gap-1">
                    ⚡ {tc.toolName || tc.name}
                  </div>
                  {tc.args && (
                    <pre className="px-3 py-2 text-xs text-sky-400 font-mono overflow-x-auto">
                      {typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args, null, 2)}
                    </pre>
                  )}
                </div>
              ))}

              {/* Tool results */}
              {msg.tool_results && Array.isArray(msg.tool_results) && msg.tool_results.map((tr: any, i: number) => (
                <div key={i} className="mt-2 bg-[#15152a] border border-zinc-800 rounded-md overflow-hidden">
                  <div className="px-3 py-1.5 bg-[#1a1a30] border-b border-zinc-800 text-xs text-zinc-500">
                    📊 Result
                  </div>
                  <pre className="px-3 py-2 text-xs text-zinc-300 font-mono overflow-x-auto max-h-64 overflow-y-auto">
                    {typeof tr.result === "string" ? tr.result : JSON.stringify(tr.result, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd ai/chat/web && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add ai/chat/web/app/s/
git commit -m "feat(ai): add public share page with SSR"
```

---

## Chunk 4: Frontend Widget Integration

### Task 12: Widget Auth Token Prop

**Files:**
- Modify: `frontend/app/components/chat/AIChatWidget.tsx`

The widget needs access to the Supabase auth token from the parent app. It will receive it as a prop.

- [ ] **Step 1: Read the widget component to find where it's used**

Search for `<AIChatWidget` in `frontend/app/` to find the parent component that renders it. Also read the widget's current props/interface.

- [ ] **Step 2: Add authToken prop**

Find the widget's props (if any) or the component definition. Add an optional `authToken` prop:

```typescript
interface AIChatWidgetProps {
  authToken?: string | null;
}

export default function AIChatWidget({ authToken }: AIChatWidgetProps) {
```

If the component currently has no props interface, create one.

- [ ] **Step 3: Pass authToken from parent**

In the parent component that renders `<AIChatWidget>`, get the Supabase session and pass the token:

```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase"; // or wherever supabase client lives

// In the parent component:
const [authToken, setAuthToken] = useState<string | null>(null);

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setAuthToken(session?.access_token ?? null);
  });
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setAuthToken(session?.access_token ?? null);
  });
  return () => subscription.unsubscribe();
}, []);

// In JSX:
<AIChatWidget authToken={authToken} />
```

Verify how Supabase is initialized in the frontend app first — look for `@supabase/supabase-js` imports.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/chat/AIChatWidget.tsx frontend/app/
git commit -m "feat(frontend): pass auth token to AI chat widget"
```

---

### Task 13: Widget Session Dropdown

**Files:**
- Modify: `frontend/app/components/chat/AIChatWidget.tsx`

Add a compact session history dropdown to the widget header.

- [ ] **Step 1: Add session state and fetch logic**

Inside the widget component, add:

Reuse the existing `AI_CHAT_URL` constant (already defined near the top of the file, ~line 24).

```typescript
interface WidgetSession {
  id: string;
  title: string;
  source?: string;
  updated_at: string;
}

const [sessions, setSessions] = useState<WidgetSession[]>([]);
const [sessionId, setSessionId] = useState<string>(crypto.randomUUID());
const [showSessions, setShowSessions] = useState(false);

// Fetch recent sessions when authenticated
useEffect(() => {
  if (!authToken) { setSessions([]); return; }
  fetch(`${AI_CHAT_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
    .then((r) => r.ok ? r.json() : { sessions: [] })
    .then(({ sessions }) => setSessions((sessions || []).slice(0, 5)))
    .catch(() => {});
}, [authToken]);
```

- [ ] **Step 2: Add hamburger button to header**

In the widget header area (around line 1469-1502), add a hamburger icon before the title. Only show when logged in:

```tsx
{authToken && (
  <button
    onClick={() => setShowSessions(!showSessions)}
    className="p-1 text-zinc-400 hover:text-white transition-colors"
    title="Session history"
  >
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
    </svg>
  </button>
)}
```

- [ ] **Step 3: Add session dropdown panel**

Below the header, add a collapsible session list:

```tsx
{showSessions && authToken && (
  <div className="bg-zinc-900/95 border-b border-white/10 px-3 py-2 max-h-[160px] overflow-y-auto">
    <div className="flex justify-between items-center mb-1.5">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Recent Sessions</span>
      <button
        onClick={() => {
          setSessionId(crypto.randomUUID());
          setMessages([]);
          setShowSessions(false);
        }}
        className="text-[11px] text-sky-400 hover:text-sky-300"
      >
        + New
      </button>
    </div>
    {sessions.map((s) => (
      <button
        key={s.id}
        onClick={async () => {
          const res = await fetch(`${AI_CHAT_URL}/api/sessions/${s.id}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (res.ok) {
            const { messages: dbMsgs } = await res.json();
            setSessionId(s.id);
            // Convert DB messages to UIMessage format expected by useChat
            const uiMessages = dbMsgs.map((m: any) => ({
              id: m.id || crypto.randomUUID(),
              role: m.role,
              content: m.content || "",
              parts: [
                ...(m.content ? [{ type: "text", text: m.content }] : []),
                ...(m.tool_calls || []).map((tc: any) => ({
                  type: "tool-invocation",
                  toolInvocation: {
                    toolName: tc.toolName || tc.name,
                    args: tc.args,
                    state: "result",
                    result: m.tool_results?.find((tr: any) => (tr.name === tc.toolName || tr.name === tc.name))?.result,
                  },
                })),
              ],
              createdAt: new Date(m.created_at),
            }));
            setMessages(uiMessages);
            setShowSessions(false);
          }
        }}
        className={`w-full text-left px-2 py-1.5 rounded text-xs flex justify-between items-center ${
          s.id === sessionId ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50"
        }`}
      >
        <span className="truncate mr-2">{s.title}</span>
        <span className="text-[10px] text-zinc-600 whitespace-nowrap">
          {formatRelativeTime(s.updated_at)}
        </span>
      </button>
    ))}
    <a
      href={`${AI_CHAT_URL}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-center text-[11px] text-sky-400 hover:text-sky-300 pt-1.5 mt-1 border-t border-white/5"
    >
      View all at ai.flowindex.io →
    </a>
  </div>
)}
```

- [ ] **Step 4: Add formatRelativeTime helper**

```typescript
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/app/components/chat/AIChatWidget.tsx
git commit -m "feat(frontend): add session history dropdown to AI widget"
```

---

### Task 14: Widget Auto-Save

**Files:**
- Modify: `frontend/app/components/chat/AIChatWidget.tsx`

After each completed chat exchange, save messages to the API.

- [ ] **Step 1: Add auto-save logic**

The `useChat` hook from `@ai-sdk/react` has an `onFinish` callback or status tracking. Find how the widget currently knows when a response is complete (look for `isLoading` state or `onFinish`).

Add a save function:

```typescript
const saveMessages = async (userMsg: any, assistantMsg: any) => {
  if (!authToken || !sessionId) return;

  // Extract tool parts from assistant message
  const toolCalls = assistantMsg.parts
    ?.filter((p: any) => p.type === "tool-invocation")
    ?.map((p: any) => ({ toolName: p.toolInvocation.toolName, args: p.toolInvocation.args })) || null;

  const toolResults = assistantMsg.parts
    ?.filter((p: any) => p.type === "tool-invocation" && p.toolInvocation.state === "result")
    ?.map((p: any) => ({ name: p.toolInvocation.toolName, result: p.toolInvocation.result })) || null;

  const textContent = assistantMsg.parts
    ?.filter((p: any) => p.type === "text")
    ?.map((p: any) => p.text)
    ?.join("") || assistantMsg.content || "";

  await fetch(`${AI_CHAT_URL}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      messages: [
        { role: "user", content: userMsg.content },
        { role: "assistant", content: textContent, tool_calls: toolCalls, tool_results: toolResults },
      ],
      title: userMsg.content,
      source: "widget",
    }),
  }).catch(() => {}); // Silent fail — session save is best-effort

  // Refresh session list
  setSessions((prev) => {
    const exists = prev.find((s) => s.id === sessionId);
    if (exists) return prev;
    return [{ id: sessionId, title: userMsg.content.slice(0, 80), updated_at: new Date().toISOString() }, ...prev].slice(0, 5);
  });
};
```

- [ ] **Step 2: Wire save to chat completion**

Find the `useChat` hook configuration and add `onFinish`:

```typescript
// In the useChat configuration or after response completes:
// The exact integration depends on how the widget currently uses useChat.
// Look for the onFinish callback or status === 'ready' after streaming.
```

The implementation will depend on the exact `useChat` API usage in the widget. Read the current hook setup and wire `saveMessages` to fire after each complete assistant response.

- [ ] **Step 3: Verify build**

```bash
cd frontend && bun run build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/components/chat/AIChatWidget.tsx
git commit -m "feat(frontend): add auto-save to AI widget for logged-in users"
```

---

### Task 15: Widget Share Button

**Files:**
- Modify: `frontend/app/components/chat/AIChatWidget.tsx`

- [ ] **Step 1: Add share button to widget header**

Next to the existing clear/close buttons in the header (around line 1484-1501), add a share button:

```tsx
{authToken && messages.length > 0 && (
  <button
    onClick={async () => {
      const res = await fetch(`${AI_CHAT_URL}/api/sessions/${sessionId}/share`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const { share_url } = await res.json();
        await navigator.clipboard.writeText(share_url);
        // Show brief toast/feedback that link was copied
      }
    }}
    className="p-1.5 text-zinc-400 hover:text-white transition-colors"
    title="Share conversation"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  </button>
)}
```

The widget share is simpler than the web app — just copy the link directly with a single click (no dialog needed since space is limited).

- [ ] **Step 2: Add brief "Copied!" feedback**

Add a state for showing copy feedback:

```typescript
const [shareToast, setShareToast] = useState(false);
```

After copying, show a brief toast:

```typescript
setShareToast(true);
setTimeout(() => setShareToast(false), 2000);
```

Render the toast near the share button:

```tsx
{shareToast && (
  <span className="absolute top-full right-0 mt-1 px-2 py-1 bg-zinc-800 text-sky-400 text-[10px] rounded whitespace-nowrap">
    Link copied!
  </span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/components/chat/AIChatWidget.tsx
git commit -m "feat(frontend): add share button to AI widget"
```

---

## Chunk 5: Integration Testing & Cleanup

### Task 16: Update chat-store Callers in AI Chat Web

**Files:**
- Modify: `ai/chat/web/components/chat.tsx` (if it calls saveSession directly)
- Modify: `ai/chat/web/app/page.tsx` (if session handling changed)

- [ ] **Step 1: Check all callers of chat-store functions**

Search for `saveSession`, `listSessions`, `loadMessages`, `deleteSession` in `ai/chat/web/` and verify they all use the updated signatures.

- [ ] **Step 2: Update chat.tsx save logic**

The chat component currently calls `saveSession()` after each response. Ensure it now passes the correct parameters including `source: "web"`. Check that the message format matches what the API expects.

The key change: the old `saveSession` did a full replace (delete all + insert). The new API appends incrementally. The chat component should now only send the NEW messages from the latest exchange, not the entire history.

- [ ] **Step 3: Update page.tsx if needed**

Check if `page.tsx` handles session creation or ID generation that needs to be updated.

- [ ] **Step 4: Verify full build**

```bash
cd ai/chat/web && bun run build
```

- [ ] **Step 5: Commit**

```bash
git add ai/chat/web/
git commit -m "fix(ai): update chat-store callers for new API-backed sessions"
```

---

### Task 17: End-to-End Smoke Test

No code changes — manual verification.

- [ ] **Step 1: Start dev servers**

```bash
cd ai/chat/web && bun run dev &
cd frontend && bun run dev &
```

- [ ] **Step 2: Test session CRUD via curl**

```bash
# Get auth token from browser devtools (Supabase session)
TOKEN="<paste token>"

# List sessions
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/sessions | jq .

# Create session
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Test session","source":"web"}' \
  http://localhost:3001/api/sessions | jq .

# Append messages (use session ID from above)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"},{"role":"assistant","content":"Hi there!"}],"title":"Test session","source":"web"}' \
  http://localhost:3001/api/sessions/<SESSION_ID>/messages | jq .

# Get session + messages
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/sessions/<SESSION_ID> | jq .

# Share session
curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/sessions/<SESSION_ID>/share | jq .

# View shared session (no auth)
curl -s http://localhost:3001/api/share/<SHARE_ID> | jq .

# Delete share
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/sessions/<SESSION_ID>/share | jq .

# Delete session
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/sessions/<SESSION_ID> | jq .
```

- [ ] **Step 3: Test widget in browser**

1. Open frontend at localhost:5173
2. Log in via Supabase
3. Open AI chat widget
4. Send a message, verify it completes
5. Check hamburger menu shows session list
6. Start a new chat, verify the old session appears in the list
7. Click old session to reload it
8. Click share button, verify link is copied
9. Open share link in incognito, verify read-only view

- [ ] **Step 4: Test AI chat web**

1. Open ai.flowindex.io (or localhost:3001)
2. Log in
3. Send a message
4. Check sidebar shows session with correct title
5. Click share button in header
6. Verify share dialog with copy + revoke
7. Open share link in incognito

- [ ] **Step 5: Final commit with any fixes**

```bash
git add -A && git commit -m "fix: address issues found in smoke testing"
```
