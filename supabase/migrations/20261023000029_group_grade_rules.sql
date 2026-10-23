-- A supplied restriction must never become "everyone" after parsing an empty array.
create or replace function public.create_group(
  p_name text, p_description text, p_icon text, p_color text, p_category text, p_settings jsonb,
  p_rules jsonb default '[]', p_parent uuid default null
) returns public.groups
language plpgsql security definer set search_path = public as $$
declare row groups%rowtype; r jsonb; grade_values int[];
begin
  if not app.is_staff() then raise exception 'Only staff can create groups.' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the group.'; end if;
  insert into groups (name, description, icon, color, category, settings, parent_group_id, created_by)
  values (trim(p_name), coalesce(p_description, ''), coalesce(p_icon, '💬'), coalesce(p_color, '#00239C'),
          coalesce(p_category, 'class'), p_settings, p_parent, auth.uid()) returning * into row;
  insert into memberships (group_id, user_id, role, source) values (row.id, auth.uid(), 'owner', 'manual');
  for r in select * from jsonb_array_elements(coalesce(p_rules, '[]')) loop
    grade_values := null;
    if r ? 'grades' then
      if jsonb_typeof(r->'grades') <> 'array' or jsonb_array_length(r->'grades') = 0 then
        raise exception 'Choose at least one grade, or omit the grade restriction.';
      end if;
      if exists (select 1 from jsonb_array_elements(r->'grades') x
                 where jsonb_typeof(x) <> 'number' or x::text !~ '^-?[0-9]+$'
                    or x::numeric not between -3 and 12) then
        raise exception 'Grades must be whole numbers from -3 through 12 (Kindergarten is 0).';
      end if;
      select array_agg(x::int) into grade_values from jsonb_array_elements_text(r->'grades') x;
    end if;
    insert into assignment_rules (group_id, school_roles, grades, roster_ids, include_guardians_as, assign_as)
    values (row.id,
            (select array_agg(x) from jsonb_array_elements_text(r->'schoolRoles') x), grade_values,
            (select array_agg(x) from jsonb_array_elements_text(coalesce(r->'rosterIds', '[]') || coalesce(r->'sectionIds', '[]') || coalesce(r->'teamIds', '[]') || coalesce(r->'clubIds', '[]')) x),
            r->>'includeGuardiansAs', coalesce(r->>'assignAs', 'member'));
  end loop;
  return row;
end $$;
