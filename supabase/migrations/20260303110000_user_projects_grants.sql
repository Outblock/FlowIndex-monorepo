-- Grant table access to PostgREST roles for user_projects and project_files
-- Fixes: "permission denied for table user_projects"

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_projects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO service_role;

GRANT SELECT ON public.user_projects TO authenticated;
GRANT SELECT ON public.project_files TO authenticated;

GRANT SELECT ON public.user_projects TO anon;
GRANT SELECT ON public.project_files TO anon;
