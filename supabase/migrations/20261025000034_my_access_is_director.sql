-- my_access() returned "isDirector": null for everyone without an admin tier (null =
-- 'director' is null in SQL), and the app's check of the reply (src/api/schemas.ts)
-- expects true or false, so the Connect tab failed to load for them. Same function,
-- with isDirector always true or false.

create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tier', p.admin_tier,
    'roleName', r.name,
    'isDirector', coalesce(p.admin_tier = 'director', false),
    'granted', p.permissions,
    'permissions', app.permissions(),
    'mfaRequired', coalesce(app.setting('require_admin_mfa'), 'true') = 'true'
                   and (p.admin_tier is not null or cardinality(p.permissions) > 0),
    'mfaVerified', app.mfa_ok() and coalesce(app.setting('require_admin_mfa'), 'true') = 'true')
  from profiles p left join admin_roles r on r.id = p.admin_tier
  where p.id = auth.uid()
$$;
