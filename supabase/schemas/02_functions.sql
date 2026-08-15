create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Non-throwing text -> uuid cast. Used in storage policies where a path segment
-- may not be a uuid; returning null lets the membership check simply fail closed.
create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception
  when others then
    return null;
end;
$$;

-- The lexorank "middle" bucket, used only for rows seeded by database triggers
-- (signup provisioning). Application code must always generate ranks through
-- lib/rank/ so the alphabet stays consistent.
create or replace function public.first_rank()
returns text
language sql
immutable
as $$
  select '0|UUUUUU:'::text;
$$;

create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_role_of(p_workspace_id) in ('owner', 'admin');
$$;
