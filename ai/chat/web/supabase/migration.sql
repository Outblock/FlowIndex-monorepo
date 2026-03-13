-- Run this in Supabase SQL Editor

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New chat',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text,
  sql text,
  result jsonb,
  error text,
  created_at timestamptz default now()
);

-- RLS policies
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

create policy "Users can manage own sessions"
  on public.chat_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage messages in own sessions"
  on public.chat_messages for all
  using (session_id in (select id from public.chat_sessions where user_id = auth.uid()))
  with check (session_id in (select id from public.chat_sessions where user_id = auth.uid()));

-- Index for fast session listing
create index if not exists idx_chat_sessions_user_updated
  on public.chat_sessions(user_id, updated_at desc);

create index if not exists idx_chat_messages_session
  on public.chat_messages(session_id, created_at asc);

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
