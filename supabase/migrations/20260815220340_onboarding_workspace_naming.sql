-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.create_workspace (
  p_name text,
  p_slug text DEFAULT NULL::text
)
  RETURNS public.workspaces
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid := gen_random_uuid();
  v_ws  public.workspaces%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.workspaces (id, name, slug, created_by)
  values (v_id, p_name, public.generate_workspace_slug(coalesce(p_slug, p_name)), v_uid);

  perform public.seed_workspace_content(v_id, v_uid);

  select * into v_ws from public.workspaces w where w.id = v_id;

  return v_ws;
end;
$function$;

CREATE FUNCTION public.generate_workspace_slug (
  p_name       text,
  p_exclude_id uuid DEFAULT NULL::uuid
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_slug text;
begin
  v_slug := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  v_slug := left(nullif(v_slug, ''), 40);

  if v_slug is null or length(v_slug) < 3 then
    v_slug := 'workspace';
  end if;

  if exists (
    select 1
    from public.workspaces w
    where w.slug = v_slug
      and (p_exclude_id is null or w.id <> p_exclude_id)
  ) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  return v_slug;
end;
$function$;

REVOKE ALL ON FUNCTION public.generate_workspace_slug(text, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.generate_workspace_slug(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_username     text;
  v_workspace_id uuid;
begin
  v_username := public.generate_username(
    coalesce(
      new.raw_user_meta_data ->> 'username',
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    new.id
  );

  insert into public.profiles (id, username, full_name, display_name, avatar_path)
  values (
    new.id,
    v_username,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  insert into public.workspaces (name, slug, created_by, is_personal)
  values (
    coalesce(new.raw_user_meta_data ->> 'workspace_name', v_username || '''s workspace'),
    v_username || '-' || substr(replace(new.id::text, '-', ''), 1, 6),
    new.id,
    true
  )
  returning id into v_workspace_id;

  -- Shared with create_workspace (04_workspaces.sql), so every workspace begins
  -- with the same starter content rather than only the first one.
  perform public.seed_workspace_content(v_workspace_id, new.id);

  return new;
end;
$function$;

CREATE FUNCTION public.rename_workspace (
  p_workspace_id uuid,
  p_name         text,
  p_slug         text DEFAULT NULL::text
)
  RETURNS public.workspaces
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_ws public.workspaces%rowtype;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a workspace needs a name' using errcode = '23514';
  end if;

  begin
    update public.workspaces w
    set name = trim(p_name),
        slug = public.generate_workspace_slug(coalesce(p_slug, p_name), p_workspace_id)
    where w.id = p_workspace_id
      and w.deleted_at is null
    returning * into v_ws;
  exception
    when unique_violation then
      -- Two callers claiming the same name at once. Same strategy as a rank
      -- collision: append entropy and retry exactly once, rather than looping.
      update public.workspaces w
      set name = trim(p_name),
          slug = left(public.generate_workspace_slug(coalesce(p_slug, p_name), p_workspace_id), 40)
                 || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
      where w.id = p_workspace_id
        and w.deleted_at is null
      returning * into v_ws;
  end;

  if not found then
    raise exception 'not permitted to rename this workspace' using errcode = '42501';
  end if;

  return v_ws;
end;
$function$;

REVOKE ALL ON FUNCTION public.rename_workspace(uuid, text, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.rename_workspace(uuid, text, text) TO authenticated;

CREATE FUNCTION public.seed_workspace_content (
  p_workspace_id uuid,
  p_user_id      uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_collection_id uuid;
begin
  insert into public.collections (workspace_id, private_to, name, icon, rank, created_by)
  values (p_workspace_id, p_user_id, 'Getting started', '📘', public.first_rank(), p_user_id)
  returning id into v_collection_id;

  insert into public.pages (
    collection_id, workspace_id, title, rank, created_by, last_edited_by, published_at
  )
  values (
    v_collection_id, p_workspace_id, 'Welcome to Kortex',
    public.first_rank(), p_user_id, p_user_id, now()
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.seed_workspace_content(uuid, uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.seed_workspace_content(uuid, uuid) TO authenticated;
-- =============================================================================
-- HAND-WRITTEN TAIL
-- =============================================================================
-- `supabase db diff` emits only the `FROM PUBLIC` half of a
-- `revoke ... from public, anon` and treats the `anon` grants as a no-op. anon
-- inherits from PUBLIC so the effect is already correct, but these are restated
-- to match supabase/schemas/04_workspaces.sql exactly and to keep the intent
-- legible to anyone auditing what anon can reach.
--
-- Nothing else was lost here: this migration adds no indexes and touches no
-- storage objects.

REVOKE EXECUTE ON FUNCTION public.generate_workspace_slug(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_workspace_content(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rename_workspace(uuid, text, text) FROM anon;
