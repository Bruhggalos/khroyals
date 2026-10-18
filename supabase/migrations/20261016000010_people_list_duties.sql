-- The paged admin people list (20261016000009) also returns the car line duty
-- and Volunteer Leader flags the admin portal shows on each person.

drop function public.admin_list_people(text, text, int, int);

create function public.admin_list_people(
  p_search text default null, p_filter text default 'all', p_limit int default 25, p_offset int default 0
) returns table (
  id uuid, first_name text, last_name text, school_role text, grade int, email text,
  admin_tier text, permissions text[], carline_duty boolean, volunteer_lead boolean, created_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path = public as $$
declare term text := '%' || lower(coalesce(trim(p_search), '')) || '%';
begin
  perform app.require_permission('people.view');
  return query
    select p.id, p.first_name, p.last_name, p.school_role, p.grade, pp.email, p.admin_tier, p.permissions,
           p.carline_duty, p.volunteer_lead, p.created_at, count(*) over () as total
    from profiles p left join profile_private pp on pp.id = p.id
    where (lower(p.first_name || ' ' || p.last_name || ' ' || coalesce(pp.email, '')) like term)
      and case coalesce(p_filter, 'all')
            when 'pending'  then p.school_role is null
            when 'staff'    then p.school_role in ('admin', 'teacher', 'staff')
            when 'parents'  then p.school_role = 'parent'
            when 'students' then p.school_role = 'student'
            when 'admins'   then p.admin_tier is not null or cardinality(p.permissions) > 0
            else true end
    order by (p.school_role is null) desc, (p.admin_tier = 'director') desc, p.last_name, p.first_name, p.id
    limit greatest(1, least(coalesce(p_limit, 25), 100)) offset greatest(0, coalesce(p_offset, 0));
end $$;

revoke all on function public.admin_list_people(text, text, int, int) from public, anon;
grant execute on function public.admin_list_people(text, text, int, int) to authenticated, service_role;
