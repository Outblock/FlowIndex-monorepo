-- Chat session persistence & sharing
-- Extends chat_sessions and chat_messages for session history and public sharing

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
