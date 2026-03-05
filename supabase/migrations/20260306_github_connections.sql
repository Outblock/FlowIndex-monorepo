-- GitHub App installation connections for Runner projects
CREATE TABLE IF NOT EXISTS public.runner_github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.user_projects(id) ON DELETE SET NULL,
  installation_id BIGINT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_path TEXT NOT NULL DEFAULT '/',
  branch TEXT NOT NULL DEFAULT 'main',
  network TEXT NOT NULL DEFAULT 'testnet',
  workflow_configured BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ,
  last_commit_sha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runner_github_connections_user
  ON public.runner_github_connections(user_id);
ALTER TABLE public.runner_github_connections
  ADD CONSTRAINT uq_runner_github_connections_project UNIQUE (project_id);

-- Grant access to service_role (used by edge functions via Supabase client)
GRANT ALL ON public.runner_github_connections TO service_role;
