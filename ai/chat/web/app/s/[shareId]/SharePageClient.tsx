"use client";

import { useState } from "react";

/* ---------- types ---------- */

interface ToolCall {
  name?: string;
  arguments?: string;
  [key: string]: unknown;
}

interface ShareMessage {
  id: string;
  role: string;
  content: string | null;
  tool_calls: ToolCall[] | null;
  tool_results: unknown[] | null;
  attachments: unknown[] | null;
  created_at: string;
}

interface ShareSession {
  title: string | null;
  source: string | null;
  shared_at: string | null;
}

interface Props {
  session: ShareSession;
  messages: ShareMessage[];
}

/* ---------- small helpers ---------- */

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function prettyJson(value: unknown): string {
  try {
    if (typeof value === "string") {
      return JSON.stringify(JSON.parse(value), null, 2);
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/* ---------- collapsible tool block ---------- */

function ToolCallBlock({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const name = call.name || "tool_call";
  const args = call.arguments;

  return (
    <div className="my-2 rounded-md border border-zinc-700 bg-zinc-800/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-mono text-sky-400 hover:bg-zinc-700/40 transition-colors"
      >
        <span className="text-xs select-none">{open ? "▾" : "▸"}</span>
        {name}
      </button>
      {open && args && (
        <pre className="overflow-x-auto border-t border-zinc-700 px-3 py-2 text-xs text-zinc-300 whitespace-pre-wrap">
          {prettyJson(args)}
        </pre>
      )}
    </div>
  );
}

function ToolResultBlock({ result }: { result: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-2 rounded-md border border-zinc-700 bg-zinc-800/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-mono text-emerald-400 hover:bg-zinc-700/40 transition-colors"
      >
        <span className="text-xs select-none">{open ? "▾" : "▸"}</span>
        Result
      </button>
      {open && (
        <pre className="overflow-x-auto border-t border-zinc-700 px-3 py-2 text-xs text-zinc-300 whitespace-pre-wrap">
          {prettyJson(result)}
        </pre>
      )}
    </div>
  );
}

/* ---------- single message ---------- */

function Message({ msg }: { msg: ShareMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className="py-4">
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {isUser ? "User" : "Assistant"}
      </div>
      <div
        className={`rounded-lg px-4 py-3 ${
          isUser ? "bg-[#252540]" : "bg-[#1e1e3a]"
        }`}
      >
        {msg.content && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>
        )}
        {msg.tool_calls?.map((tc, i) => (
          <ToolCallBlock key={`tc-${i}`} call={tc} />
        ))}
        {msg.tool_results?.map((tr, i) => (
          <ToolResultBlock key={`tr-${i}`} result={tr} />
        ))}
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

export default function SharePageClient({ session, messages }: Props) {
  return (
    <div className="min-h-screen bg-[#0f0f23] text-zinc-200">
      {/* top banner */}
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-[#0f0f23]/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-medium text-zinc-400">
            FlowIndex AI{" "}
            <span className="text-zinc-600">&mdash;</span>{" "}
            <span className="text-zinc-500">Shared conversation</span>
          </span>
          <a
            href="/"
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400 transition-colors"
          >
            Try FlowIndex AI &rarr;
          </a>
        </div>
      </header>

      {/* messages */}
      <main className="mx-auto max-w-3xl px-4 py-8">
        {session.title && (
          <h1 className="mb-1 text-2xl font-bold text-zinc-100">
            {session.title}
          </h1>
        )}
        {session.shared_at && (
          <p className="mb-6 text-xs text-zinc-500">
            Shared on {formatDate(session.shared_at)}
          </p>
        )}

        <div className="divide-y divide-zinc-800/50">
          {messages.map((msg) => (
            <Message key={msg.id} msg={msg} />
          ))}
        </div>

        {messages.length === 0 && (
          <p className="py-12 text-center text-zinc-500">
            This conversation has no messages.
          </p>
        )}
      </main>
    </div>
  );
}
