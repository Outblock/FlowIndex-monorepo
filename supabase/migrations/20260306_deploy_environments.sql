-- Deploy environments — maps branch → network per project
CREATE TABLE IF NOT EXISTS public.runner_deploy_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.runner_github_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'mainnet',
  flow_address TEXT,
  secrets_configured BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(connection_id, name),
  UNIQUE(connection_id, branch)
);

CREATE INDEX IF NOT EXISTS idx_deploy_environments_connection
  ON public.runner_deploy_environments(connection_id);

GRANT ALL ON public.runner_deploy_environments TO service_role;
