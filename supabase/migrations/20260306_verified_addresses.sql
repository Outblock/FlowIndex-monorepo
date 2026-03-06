-- Verified Flow addresses bound to user accounts
CREATE TABLE IF NOT EXISTS public.runner_verified_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet',
  label TEXT,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, address, network)
);

CREATE INDEX IF NOT EXISTS idx_verified_addresses_user
  ON public.runner_verified_addresses(user_id);

GRANT ALL ON public.runner_verified_addresses TO service_role;
