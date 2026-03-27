CREATE TABLE IF NOT EXISTS pending_approvals (
  pending_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_id TEXT,
  approve_url TEXT NOT NULL,
  reject_url TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires ON pending_approvals (expires_at) WHERE NOT resolved;
