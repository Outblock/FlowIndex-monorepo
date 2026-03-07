-- Fix: passkey tables need explicit GRANT for service_role and authenticated roles.
-- The original migration created tables + RLS but missed table-level GRANTs.

-- Wallet columns (missed in original migration due to ON_ERROR_STOP=0)
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS public_key_sec1_hex TEXT;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS flow_address TEXT;
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_flow_address ON public.passkey_credentials(flow_address);

GRANT ALL ON public.passkey_credentials TO service_role;
GRANT ALL ON public.passkey_challenges TO service_role;
GRANT ALL ON public.passkey_rate_limits TO service_role;
GRANT ALL ON public.passkey_audit_log TO service_role;

GRANT SELECT, DELETE ON public.passkey_credentials TO authenticated;
GRANT SELECT ON public.passkey_audit_log TO authenticated;
