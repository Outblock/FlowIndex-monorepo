-- Agent login sessions (for zero-config MCP wallet_login flow)
CREATE TABLE IF NOT EXISTS public.agent_login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  wallet_token TEXT,
  callback_origin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);

CREATE INDEX IF NOT EXISTS idx_agent_login_sessions_status
  ON public.agent_login_sessions(status) WHERE status = 'pending';

-- Wallet approval requests (for passkey tx approval)
CREATE TABLE IF NOT EXISTS public.wallet_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  tx_message_hex TEXT NOT NULL,
  cadence_script TEXT,
  cadence_args JSONB,
  description TEXT,
  signature TEXT,
  credential_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes'
);

CREATE INDEX IF NOT EXISTS idx_wallet_approval_requests_user_status
  ON public.wallet_approval_requests(user_id, status) WHERE status = 'pending';

-- RLS policies
ALTER TABLE public.agent_login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_login_sessions_service ON public.agent_login_sessions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY wallet_approval_requests_service ON public.wallet_approval_requests
  FOR ALL USING (true) WITH CHECK (true);
