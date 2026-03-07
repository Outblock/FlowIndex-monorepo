-- Add provision tracking columns for mainnet + testnet account creation.
-- flow_address (mainnet) already exists; add testnet address + tx IDs as metadata.

ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS flow_address_testnet TEXT;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS provision_tx_mainnet TEXT;
ALTER TABLE public.passkey_credentials ADD COLUMN IF NOT EXISTS provision_tx_testnet TEXT;

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_flow_address_testnet
  ON public.passkey_credentials(flow_address_testnet);
