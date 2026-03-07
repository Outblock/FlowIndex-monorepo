-- Fix: passkey tables need explicit GRANT for service_role and authenticated roles.
-- The original migration created tables + RLS but missed table-level GRANTs.

GRANT ALL ON public.passkey_credentials TO service_role;
GRANT ALL ON public.passkey_challenges TO service_role;
GRANT ALL ON public.passkey_rate_limits TO service_role;
GRANT ALL ON public.passkey_audit_log TO service_role;

GRANT SELECT, DELETE ON public.passkey_credentials TO authenticated;
GRANT SELECT ON public.passkey_audit_log TO authenticated;
