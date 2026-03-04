-- Unify user/team tables: drop unused Supabase team tables, simplify trigger.
--
-- The Go backend webhook system never queries teams, team_memberships, or
-- user_platform_roles. Sim Studio uses its own organization/member tables
-- for team management and billing. Dropping these eliminates the parallel
-- system and lets both services share Sim Studio's user table.

-- 1. Drop the trigger that auto-creates teams on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop the old function
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 3. Create simplified function — only ensures user_profiles record exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recreate trigger with simplified function
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Drop unused tables (order matters: FKs first)
DROP INDEX IF EXISTS idx_team_memberships_user;
DROP INDEX IF EXISTS idx_team_memberships_team;
DROP TABLE IF EXISTS public.team_memberships CASCADE;

DROP TABLE IF EXISTS public.teams CASCADE;

DROP INDEX IF EXISTS idx_user_platform_roles_role;
DROP TABLE IF EXISTS public.user_platform_roles CASCADE;
