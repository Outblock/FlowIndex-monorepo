-- User custodial keys for Cadence Runner
CREATE TABLE IF NOT EXISTS public.user_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  flow_address TEXT NOT NULL,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  key_index INTEGER NOT NULL DEFAULT 0,
  sig_algo TEXT NOT NULL DEFAULT 'ECDSA_P256',
  hash_algo TEXT NOT NULL DEFAULT 'SHA3_256',
  source TEXT NOT NULL CHECK (source IN ('imported', 'created')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keys"
  ON public.user_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own keys"
  ON public.user_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own keys"
  ON public.user_keys FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own keys"
  ON public.user_keys FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_keys_user_id ON public.user_keys(user_id);
CREATE INDEX idx_user_keys_flow_address ON public.user_keys(flow_address);
