import { createClient } from "@/lib/supabase/client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sql?: string;
  result?: unknown;
  error?: string;
  loading?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
}

// ── localStorage helpers (anonymous) ──

function getLocalSessions(): ChatSession[] {
  try {
    return JSON.parse(localStorage.getItem("chat_sessions") || "[]");
  } catch { return []; }
}

function setLocalSessions(sessions: ChatSession[]) {
  localStorage.setItem("chat_sessions", JSON.stringify(sessions));
}

function getLocalMessages(sessionId: string): ChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(`chat_msgs_${sessionId}`) || "[]");
  } catch { return []; }
}

function setLocalMessages(sessionId: string, msgs: ChatMessage[]) {
  localStorage.setItem(`chat_msgs_${sessionId}`, JSON.stringify(msgs));
}

// ── Public API ──

export async function listSessions(userId: string | null): Promise<ChatSession[]> {
  if (!userId) return getLocalSessions();

  const supabase = createClient();
  const { data } = await supabase
    .from("chat_sessions")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function loadMessages(sessionId: string, userId: string | null): Promise<ChatMessage[]> {
  if (!userId) return getLocalMessages(sessionId);

  const supabase = createClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("role, content, sql, result, error")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content ?? "",
    sql: m.sql ?? undefined,
    result: m.result ?? undefined,
    error: m.error ?? undefined,
  }));
}

export async function saveSession(
  sessionId: string,
  title: string,
  messages: ChatMessage[],
  userId: string | null
): Promise<void> {
  const now = new Date().toISOString();

  if (!userId) {
    // localStorage
    const sessions = getLocalSessions();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx >= 0) {
      sessions[idx].title = title;
      sessions[idx].updated_at = now;
    } else {
      sessions.unshift({ id: sessionId, title, updated_at: now });
    }
    // Keep max 20 local sessions
    setLocalSessions(sessions.slice(0, 20));
    setLocalMessages(sessionId, messages);
    return;
  }

  const supabase = createClient();

  // Upsert session
  await supabase.from("chat_sessions").upsert({
    id: sessionId,
    user_id: userId,
    title,
    updated_at: now,
  });

  // Delete old messages then insert fresh
  await supabase.from("chat_messages").delete().eq("session_id", sessionId);

  const rows = messages
    .filter((m) => !m.loading)
    .map((m, i) => ({
      session_id: sessionId,
      role: m.role,
      content: m.content,
      sql: m.sql ?? null,
      result: m.result ?? null,
      error: m.error ?? null,
      created_at: new Date(Date.now() + i).toISOString(),
    }));

  if (rows.length > 0) {
    await supabase.from("chat_messages").insert(rows);
  }
}

export async function deleteSession(sessionId: string, userId: string | null): Promise<void> {
  if (!userId) {
    const sessions = getLocalSessions().filter((s) => s.id !== sessionId);
    setLocalSessions(sessions);
    localStorage.removeItem(`chat_msgs_${sessionId}`);
    return;
  }

  const supabase = createClient();
  await supabase.from("chat_messages").delete().eq("session_id", sessionId);
  await supabase.from("chat_sessions").delete().eq("id", sessionId);
}
