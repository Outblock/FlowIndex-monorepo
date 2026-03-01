# Admin RBAC (FlowIndex)

This document defines role/team-based access for `https://flowindex.io/admin`.

## Model

FlowIndex uses two permission layers:

1. Team-level roles (for collaboration):
- `team_member`
- `team_admin`

2. Platform-level roles (for control plane / admin panel):
- `platform_admin`
- `ops_admin`

Only platform-level roles are allowed to access `/admin` by default.

## Admin Panel Access Policy

Recommended production policy:

- `ADMIN_ALLOWED_ROLES=platform_admin,ops_admin`
- `ADMIN_ALLOWED_TEAMS=flowindex`

This means `/admin` requires:
- user role claim includes `platform_admin` or `ops_admin`
- and team claim includes `flowindex`

Legacy fallback:
- `ADMIN_TOKEN` is still supported as an emergency path.

## JWT Claim Locations

Backend checks role/team claims from:

- top-level: `role`, `roles`, `team`, `teams`
- nested: `app_metadata.role`, `app_metadata.roles`, `app_metadata.team`, `app_metadata.teams`
- nested: `user_metadata.role`, `user_metadata.roles`, `user_metadata.team`, `user_metadata.teams`

Values are case-insensitive and comma-separated strings are supported.

## Supabase SQL: Grant / Revoke

### 1) Inspect current metadata

```sql
select id, email, raw_app_meta_data
from auth.users
where email = 'you@example.com';
```

### 2) Grant FlowIndex admin access

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'roles', jsonb_build_array('platform_admin'),
    'teams', jsonb_build_array('flowindex'),
    'team_role', 'team_admin'
  )
where email = 'you@example.com';
```

### 3) Grant ops admin access

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'roles', jsonb_build_array('ops_admin'),
    'teams', jsonb_build_array('flowindex'),
    'team_role', 'team_member'
  )
where email = 'ops@example.com';
```

### 4) Revoke admin access (keep team membership)

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb)
  - 'roles'
where email = 'you@example.com';
```

### 5) Revoke all RBAC metadata

```sql
update auth.users
set raw_app_meta_data =
  (coalesce(raw_app_meta_data, '{}'::jsonb) - 'roles' - 'teams' - 'team_role')
where email = 'you@example.com';
```

Users must sign out and sign in again to get a refreshed JWT.

## "Enum" Status

There is no database enum constraint for role/team in `auth.users.raw_app_meta_data`.

Canonical values for FlowIndex should be treated as:

- platform roles: `platform_admin`, `ops_admin`
- team roles: `team_admin`, `team_member`
- team id/name: `flowindex` (or your own team keys)

If strict enum enforcement is required later, add a dedicated RBAC table in Postgres and validate claims against it in backend middleware.
