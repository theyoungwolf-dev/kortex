-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLES FROM anon;

CREATE EXTENSION citext WITH SCHEMA extensions;

CREATE TYPE public.workspace_role AS ENUM (
  'owner',
  'admin',
  'member',
  'guest'
);

COMMENT ON TYPE public.workspace_role IS 'owner: billing + destroy workspace. admin: manage members/settings. member: full content access. guest: read-only.';

CREATE FUNCTION public.accept_workspace_invitation (
  p_token text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower((select auth.jwt() ->> 'email'));
  v_inv   public.workspace_invitations%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_inv
  from public.workspace_invitations i
  where i.token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex')
  for update;

  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'this invitation was revoked' using errcode = '42501';
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'this invitation was already used' using errcode = '42501';
  end if;

  if v_inv.expires_at <= now() then
    raise exception 'this invitation has expired' using errcode = '42501';
  end if;

  if v_inv.email is distinct from v_email then
    raise exception 'this invitation was issued to a different email address'
      using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (v_inv.workspace_id, v_uid, v_inv.role, v_inv.invited_by)
  on conflict (workspace_id, user_id) do nothing;

  update public.workspace_invitations i
  set accepted_at = now(), accepted_by = v_uid
  where i.id = v_inv.id;

  return v_inv.workspace_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;

CREATE FUNCTION public.attachments_delete_object()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  delete from storage.objects o
  where o.bucket_id = old.bucket_id and o.name = old.storage_path;
  return old;
end;
$function$;

CREATE FUNCTION public.attachments_set_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_workspace uuid;
begin
  if new.page_id is not null then
    select p.workspace_id into v_workspace
    from public.pages p
    where p.id = new.page_id;
 
    if not found then
      raise exception 'page % does not exist', new.page_id using errcode = '23503';
    end if;
 
    new.workspace_id := v_workspace;
  end if;
 
  return new;
end;
$function$;

CREATE FUNCTION public.can_read_page (
  p_page_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and p.deleted_at is null
      and public.is_workspace_member(p.workspace_id)
      and (p.collection_owner_id is null or p.collection_owner_id = (select auth.uid()))
      and (p.is_published_tree or p.created_by = (select auth.uid()))
  );
$function$;

REVOKE ALL ON FUNCTION public.can_read_page(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_read_page(uuid) TO authenticated;

CREATE FUNCTION public.can_write_in_workspace (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.workspace_role_of(p_workspace_id) in ('owner', 'admin', 'member');
$function$;

REVOKE ALL ON FUNCTION public.can_write_in_workspace(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_write_in_workspace(uuid) TO authenticated;

CREATE FUNCTION public.can_write_page (
  p_page_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and p.deleted_at is null
      and public.can_write_in_workspace(p.workspace_id)
      and (p.collection_owner_id is null or p.collection_owner_id = (select auth.uid()))
      and (p.is_published_tree or p.created_by = (select auth.uid()))
  );
$function$;

REVOKE ALL ON FUNCTION public.can_write_page(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.can_write_page(uuid) TO authenticated;

CREATE FUNCTION public.collections_cascade_trash()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.pages p
    set deleted_at = new.deleted_at
    where p.collection_id = new.id and p.deleted_at is null;
  elsif new.deleted_at is null and old.deleted_at is not null then
    update public.pages p
    set deleted_at = null
    where p.collection_id = new.id and p.deleted_at = old.deleted_at;
  end if;
  return null;
end;
$function$;

CREATE FUNCTION public.collections_guard_trash()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.deleted_at is distinct from old.deleted_at then
    if (select auth.uid()) is not null
       and not (old.created_by = (select auth.uid())
                or old.owner_id = (select auth.uid())
                or public.is_workspace_admin(old.workspace_id))
    then
      raise exception 'only the collection author, its owner, or a workspace admin can trash it'
        using errcode = '42501';
    end if;
  end if;

  if new.workspace_id <> old.workspace_id or new.owner_id is distinct from old.owner_id then
    raise exception 'workspace_id and owner_id are immutable on collections'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE FUNCTION public.create_workspace_invitation (
  p_workspace_id uuid,
  p_email        text,
  p_role         public.workspace_role DEFAULT 'member'::public.workspace_role
)
  RETURNS TABLE (
    invitation_id uuid,
    token         text,
    expires_at    timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := lower(trim(p_email));
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_id    uuid;
  v_exp   timestamptz := now() + interval '7 days';
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- SECURITY DEFINER bypasses RLS, so the admin check happens explicitly.
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'only workspace admins can invite people' using errcode = '42501';
  end if;

  if p_role = 'owner' then
    raise exception 'ownership is transferred, not invited' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    join auth.users u on u.id = p.id
    where m.workspace_id = p_workspace_id and lower(u.email) = v_email
  ) then
    raise exception 'that person is already a member of this workspace'
      using errcode = '23505';
  end if;

  -- Re-inviting supersedes any pending invitation for the same address.
  update public.workspace_invitations i
  set revoked_at = now()
  where i.workspace_id = p_workspace_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null;

  insert into public.workspace_invitations
    (workspace_id, email, role, token_hash, invited_by, expires_at)
  values
    (p_workspace_id, v_email, p_role,
     encode(sha256(convert_to(v_token, 'utf8')), 'hex'), v_uid, v_exp)
  returning id into v_id;

  return query select v_id, v_token, v_exp;
end;
$function$;

REVOKE ALL ON FUNCTION public.create_workspace_invitation(uuid, text, public.workspace_role) FROM PUBLIC;

GRANT ALL ON FUNCTION public.create_workspace_invitation(uuid, text, public.workspace_role) TO authenticated;

CREATE FUNCTION public.first_rank()
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  select '0|UUUUUU:'::text;
$function$;

CREATE FUNCTION public.generate_username (
  p_seed    text,
  p_user_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_base   text;
  v_suffix text := substr(replace(p_user_id::text, '-', ''), 1, 6);
begin
  v_base := regexp_replace(lower(coalesce(p_seed, '')), '[^a-z0-9_-]', '', 'g');
  v_base := regexp_replace(v_base, '^[_-]+|[_-]+$', '', 'g');

  if length(v_base) < 3 then
    v_base := 'user';
  end if;

  v_base := left(v_base, 24);

  if exists (select 1 from public.profiles p where p.username = v_base) then
    return v_base || '-' || v_suffix;
  end if;

  return v_base;
end;
$function$;

REVOKE ALL ON FUNCTION public.generate_username(text, uuid) FROM PUBLIC;

CREATE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_username     text;
  v_workspace_id uuid;
  v_collection_id uuid;
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

  insert into public.collections (workspace_id, owner_id, name, icon, rank, created_by)
  values (v_workspace_id, new.id, 'Getting started', '📘', public.first_rank(), new.id)
  returning id into v_collection_id;

  insert into public.pages (
    collection_id, workspace_id, title, rank, created_by, last_edited_by, published_at
  )
  values (
    v_collection_id, v_workspace_id, 'Welcome to Kortex',
    public.first_rank(), new.id, new.id, now()
  );

  return new;
end;
$function$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.is_workspace_admin (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.workspace_role_of(p_workspace_id) in ('owner', 'admin');
$function$;

REVOKE ALL ON FUNCTION public.is_workspace_admin(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_workspace_admin(uuid) TO authenticated;

CREATE FUNCTION public.is_workspace_member (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$function$;

REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_workspace_member(uuid) TO authenticated;

CREATE FUNCTION public.is_workspace_owner (
  p_workspace_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select public.workspace_role_of(p_workspace_id) = 'owner';
$function$;

REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.is_workspace_owner(uuid) TO authenticated;

CREATE FUNCTION public.pages_after_tree_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform public.pages_recompute_subtree(new.id);
  return null;
end;
$function$;

CREATE FUNCTION public.pages_guard_trash()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.deleted_at is distinct from old.deleted_at then
    if (select auth.uid()) is not null
       and not (old.created_by = (select auth.uid())
                or public.is_workspace_admin(old.workspace_id))
    then
      raise exception 'only the page author or a workspace admin can trash it'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

CREATE FUNCTION public.pages_recompute_subtree (
  p_root uuid
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with recursive tree as (
    select
      c.id,
      coalesce(p.ancestor_ids, '{}'::uuid[])
        || case when c.parent_id is null then '{}'::uuid[] else array[c.parent_id] end
        as ancestor_ids,
      (c.published_at is not null and coalesce(p.is_published_tree, true))
        as is_published_tree
    from public.pages c
    left join public.pages p on p.id = c.parent_id
    where c.id = p_root

    union all

    select
      ch.id,
      t.ancestor_ids || ch.parent_id,
      (ch.published_at is not null and t.is_published_tree)
    from public.pages ch
    join tree t on ch.parent_id = t.id
  )
  update public.pages pg
  set ancestor_ids      = t.ancestor_ids,
      is_published_tree = t.is_published_tree
  from tree t
  where pg.id = t.id
    and (pg.ancestor_ids      is distinct from t.ancestor_ids
      or pg.is_published_tree is distinct from t.is_published_tree);
$function$;

REVOKE ALL ON FUNCTION public.pages_recompute_subtree(uuid) FROM PUBLIC;

CREATE FUNCTION public.pages_set_scope()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_collection public.collections%rowtype;
  v_parent     public.pages%rowtype;
  v_has_kids   boolean;
begin
  select * into v_collection
  from public.collections c
  where c.id = new.collection_id and c.deleted_at is null;

  if not found then
    raise exception 'collection % does not exist', new.collection_id
      using errcode = '23503';
  end if;

  -- Moving a page between collections has to drag its whole subtree along.
  -- That is what public.move_page() is for; a bare UPDATE would leave the
  -- descendants pointing at the old collection.
  if tg_op = 'UPDATE'
     and new.collection_id <> old.collection_id
     and coalesce(current_setting('kortex.moving_subtree', true), 'off') <> 'on'
  then
    select exists (
      select 1 from public.pages d where d.parent_id = old.id and d.deleted_at is null
    ) into v_has_kids;

    if v_has_kids then
      raise exception 'use public.move_page() to move a page that has sub-pages'
        using errcode = '0A000';
    end if;
  end if;

  new.workspace_id        := v_collection.workspace_id;
  new.collection_owner_id := v_collection.owner_id;

  if new.parent_id is null then
    new.ancestor_ids      := '{}'::uuid[];
    new.is_published_tree := new.published_at is not null;
  else
    select * into v_parent
    from public.pages p
    where p.id = new.parent_id and p.deleted_at is null;

    if not found then
      raise exception 'parent page % does not exist', new.parent_id
        using errcode = '23503';
    end if;

    if v_parent.collection_id <> new.collection_id then
      raise exception 'a sub-page must live in the same collection as its parent'
        using errcode = '23514';
    end if;

    if new.id = v_parent.id or new.id = any (v_parent.ancestor_ids) then
      raise exception 'a page cannot be nested beneath itself'
        using errcode = '23514';
    end if;

    new.ancestor_ids      := v_parent.ancestor_ids || v_parent.id;
    new.is_published_tree := new.published_at is not null and v_parent.is_published_tree;
  end if;

  return new;
end;
$function$;

CREATE FUNCTION public.pages_stamp_editor()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.created_by     := old.created_by;   -- authorship is immutable
  new.last_edited_by := coalesce((select auth.uid()), old.last_edited_by);
  new.last_edited_at := now();
  return new;
end;
$function$;

CREATE FUNCTION public.record_page_view (
  p_page_id uuid
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  insert into public.page_views (user_id, page_id)
  values ((select auth.uid()), p_page_id)
  on conflict (user_id, page_id) do update
    set view_count = public.page_views.view_count + 1,
        viewed_at  = now();
$function$;

GRANT ALL ON FUNCTION public.record_page_view(uuid) TO authenticated;

CREATE FUNCTION public.safe_uuid (
  p_text text
)
  RETURNS uuid
  LANGUAGE plpgsql
  IMMUTABLE
  AS $function$
begin
  return p_text::uuid;
exception
  when others then
    return null;
end;
$function$;

CREATE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE FUNCTION public.shares_workspace_with (
  p_user_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.workspace_members me
    join public.workspace_members them on them.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid())
      and them.user_id = p_user_id
  );
$function$;

REVOKE ALL ON FUNCTION public.shares_workspace_with(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.shares_workspace_with(uuid) TO authenticated;

CREATE FUNCTION public.workspace_members_immutable_keys()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  if new.workspace_id <> old.workspace_id or new.user_id <> old.user_id then
    raise exception 'workspace_id and user_id are immutable on workspace_members'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

CREATE FUNCTION public.workspace_members_protect_last_owner()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner_count int;
  v_workspace   uuid := coalesce(old.workspace_id, new.workspace_id);
begin
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role = 'owner' then
    return new;
  end if;

  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  select count(*) into v_owner_count
  from public.workspace_members m
  where m.workspace_id = v_workspace and m.role = 'owner';

  if v_owner_count <= 1 then
    raise exception 'a workspace must always have at least one owner'
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$function$;

CREATE FUNCTION public.workspace_role_of (
  p_workspace_id uuid
)
  RETURNS public.workspace_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = (select auth.uid());
$function$;

REVOKE ALL ON FUNCTION public.workspace_role_of(uuid) FROM PUBLIC;

GRANT ALL ON FUNCTION public.workspace_role_of(uuid) TO authenticated;

CREATE FUNCTION public.workspaces_seat_owner()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$function$;

CREATE TABLE public.attachments (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  page_id      uuid,
  bucket_id    text                     DEFAULT 'attachments'::text NOT NULL,
  storage_path text                     NOT NULL,
  file_name    text                     NOT NULL,
  mime_type    text                     NOT NULL,
  size_bytes   bigint                   NOT NULL,
  width        integer,
  height       integer,
  checksum     text,
  uploaded_by  uuid                     NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.attachments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_size_positive CHECK (size_bytes > 0);

GRANT ALL ON public.attachments TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.attachments TO service_role;

CREATE INDEX attachments_workspace_idx ON public.attachments (workspace_id);

CREATE UNIQUE INDEX attachments_storage_path_key ON public.attachments (bucket_id, storage_path);

CREATE INDEX attachments_page_idx ON public.attachments (page_id);

CREATE TRIGGER attachments_delete_object
  AFTER DELETE ON public.attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.attachments_delete_object();

CREATE TRIGGER attachments_set_scope
  BEFORE INSERT OR UPDATE OF page_id ON public.attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.attachments_set_scope();

CREATE POLICY attachments_delete ON public.attachments
  FOR DELETE
  TO authenticated
  USING (((uploaded_by = ( SELECT auth.uid() AS uid)) OR ((page_id IS NOT NULL) AND public.can_write_page(page_id)) OR public.is_workspace_admin(workspace_id)));

CREATE POLICY attachments_insert ON public.attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (((uploaded_by = ( SELECT auth.uid() AS uid)) AND public.can_write_in_workspace(workspace_id) AND ((page_id IS NULL) OR public.can_write_page(page_id))));

CREATE POLICY attachments_update ON public.attachments
  FOR UPDATE
  TO authenticated
  USING ((((page_id IS NULL) AND (uploaded_by = ( SELECT auth.uid() AS uid))) OR ((page_id IS NOT NULL) AND public.can_write_page(page_id))))
  WITH CHECK ((public.can_write_in_workspace(workspace_id) AND (((page_id IS NULL) AND (uploaded_by = ( SELECT auth.uid() AS uid))) OR ((page_id IS
    NOT NULL) AND public.can_write_page(page_id)))));

CREATE TABLE public.collections (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  owner_id     uuid,
  name         text                     DEFAULT 'Untitled'::text NOT NULL,
  description  text,
  icon         text,
  rank         text                     COLLATE "C" NOT NULL,
  created_by   uuid                     NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at   timestamp with time zone
);

COMMENT ON COLUMN public.collections.rank IS 'Lexorank string. MUST stay `text collate "C"` to match JS bytewise ordering.';

ALTER TABLE public.collections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.collections
  ADD CONSTRAINT collections_description_length CHECK (description IS NULL OR length(description) <= 255);

ALTER TABLE public.collections
  ADD CONSTRAINT collections_icon_length CHECK (icon IS NULL OR length(icon) <= 50);

ALTER TABLE public.collections
  ADD CONSTRAINT collections_name_length CHECK (length(name) >= 1 AND length(name) <= 255);

ALTER TABLE public.collections
  ADD CONSTRAINT collections_pkey PRIMARY KEY (id);

GRANT ALL ON public.collections TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.collections TO service_role;

CREATE UNIQUE INDEX collections_scope_rank_key ON public.collections (workspace_id, owner_id, rank)
  WHERE deleted_at IS NULL;

CREATE INDEX collections_workspace_idx ON public.collections (workspace_id, owner_id, rank)
  WHERE deleted_at IS NULL;

CREATE INDEX collections_owner_idx ON public.collections (owner_id)
  WHERE owner_id IS NOT NULL;

CREATE TRIGGER collections_cascade_trash
  AFTER UPDATE OF deleted_at ON public.collections
  FOR EACH ROW
  WHEN (old.deleted_at IS DISTINCT FROM new.deleted_at)
  EXECUTE FUNCTION public.collections_cascade_trash();

CREATE TRIGGER collections_guard_trash
  BEFORE UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.collections_guard_trash();

CREATE TRIGGER collections_set_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY collections_delete ON public.collections
  FOR DELETE
  TO authenticated
  USING
    ((public.is_workspace_member(workspace_id) AND ((owner_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR
    public.is_workspace_admin(workspace_id))));

CREATE POLICY collections_insert ON public.collections
  FOR INSERT
  TO authenticated
  WITH CHECK ((public.can_write_in_workspace(workspace_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY collections_select_live ON public.collections
  FOR SELECT
  TO authenticated
  USING (((deleted_at IS NULL) AND public.is_workspace_member(workspace_id) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY collections_select_trash ON public.collections
  FOR SELECT
  TO authenticated
  USING (((deleted_at IS
    NOT NULL) AND public.is_workspace_member(workspace_id) AND
    ((owner_id = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR ((owner_id IS NULL) AND public.is_workspace_admin(workspace_id)))));

CREATE POLICY collections_update ON public.collections
  FOR UPDATE
  TO authenticated
  USING ((public.can_write_in_workspace(workspace_id) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))))
  WITH CHECK ((public.can_write_in_workspace(workspace_id) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))));

CREATE TABLE public.page_stars (
  user_id    uuid                     NOT NULL,
  page_id    uuid                     NOT NULL,
  rank       text                     COLLATE "C" NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.page_stars
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.page_stars
  ADD CONSTRAINT page_stars_pkey PRIMARY KEY (user_id, page_id);

ALTER TABLE public.page_stars
  ADD CONSTRAINT page_stars_user_rank_key UNIQUE (user_id, rank);

GRANT ALL ON public.page_stars TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.page_stars TO service_role;

CREATE INDEX page_stars_page_idx ON public.page_stars (page_id);

CREATE POLICY page_stars_delete ON public.page_stars
  FOR DELETE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY page_stars_insert ON public.page_stars
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.can_read_page(page_id)));

CREATE POLICY page_stars_select ON public.page_stars
  FOR SELECT
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY page_stars_update ON public.page_stars
  FOR UPDATE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.page_views (
  user_id         uuid                     NOT NULL,
  page_id         uuid                     NOT NULL,
  view_count      integer                  DEFAULT 1 NOT NULL,
  first_viewed_at timestamp with time zone DEFAULT now() NOT NULL,
  viewed_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.page_views
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.page_views
  ADD CONSTRAINT page_views_pkey PRIMARY KEY (user_id, page_id);

GRANT ALL ON public.page_views TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.page_views TO service_role;

CREATE INDEX page_views_page_idx ON public.page_views (page_id, viewed_at DESC);

CREATE POLICY page_views_delete ON public.page_views
  FOR DELETE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY page_views_insert ON public.page_views
  FOR INSERT
  TO authenticated
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND public.can_read_page(page_id)));

CREATE POLICY page_views_select ON public.page_views
  FOR SELECT
  TO authenticated
  USING (public.can_read_page(page_id));

CREATE POLICY page_views_update ON public.page_views
  FOR UPDATE
  TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.pages (
  id                  uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id        uuid                     NOT NULL,
  collection_id       uuid                     NOT NULL,
  collection_owner_id uuid,
  parent_id           uuid,
  title               text                     DEFAULT 'Untitled'::text NOT NULL,
  content             jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  published_at        timestamp with time zone,
  rank                text                     COLLATE "C" NOT NULL,
  depth               integer                  GENERATED ALWAYS AS (COALESCE(array_length(ancestor_ids, 1), 0)) STORED,
  ancestor_ids        uuid[]                   DEFAULT '{}'::uuid[] NOT NULL,
  is_published_tree   boolean                  DEFAULT false NOT NULL,
  created_by          uuid                     NOT NULL,
  last_edited_by      uuid,
  last_edited_at      timestamp with time zone DEFAULT now() NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at          timestamp with time zone
);

CREATE FUNCTION public.move_page (
  p_page_id       uuid,
  p_collection_id uuid,
  p_parent_id     uuid,
  p_rank          text
)
  RETURNS public.pages
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_page   public.pages%rowtype;
  v_target public.collections%rowtype;
  v_uid    uuid := (select auth.uid());
  v_result public.pages%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_page from public.pages p where p.id = p_page_id and p.deleted_at is null;
  if not found then
    raise exception 'page not found' using errcode = 'P0002';
  end if;

  -- Source permission
  if not public.can_write_in_workspace(v_page.workspace_id)
     or (v_page.collection_owner_id is not null and v_page.collection_owner_id <> v_uid)
  then
    raise exception 'not permitted to move this page' using errcode = '42501';
  end if;

  -- Destination permission
  select * into v_target
  from public.collections c
  where c.id = p_collection_id and c.deleted_at is null;

  if not found then
    raise exception 'destination collection not found' using errcode = 'P0002';
  end if;

  if not public.can_write_in_workspace(v_target.workspace_id)
     or (v_target.owner_id is not null and v_target.owner_id <> v_uid)
  then
    raise exception 'not permitted to write to the destination collection'
      using errcode = '42501';
  end if;

  if p_parent_id is not null and p_parent_id = any (
    select d.id from public.pages d
    where d.id = p_parent_id and (d.id = p_page_id or p_page_id = any (d.ancestor_ids))
  ) then
    raise exception 'cannot move a page into its own subtree' using errcode = '23514';
  end if;

  perform set_config('kortex.moving_subtree', 'on', true);

  update public.pages p
  set collection_id = p_collection_id,
      parent_id     = p_parent_id,
      rank          = p_rank
  where p.id = p_page_id
  returning * into v_result;

  -- The AFTER trigger has already fixed ancestor_ids / is_published_tree for the
  -- subtree. Descendants still carry the old collection, so re-stamp them; this
  -- fires pages_set_scope (correcting workspace_id and collection_owner_id) but
  -- not pages_tree_sync, since collection_id is not in that trigger's column list.
  update public.pages d
  set collection_id = p_collection_id
  where p_page_id = any (d.ancestor_ids)
    and d.collection_id is distinct from p_collection_id;

  perform set_config('kortex.moving_subtree', 'off', true);

  return v_result;
end;
$function$;

REVOKE ALL ON FUNCTION public.move_page(uuid, uuid, uuid, text) FROM PUBLIC;

GRANT ALL ON FUNCTION public.move_page(uuid, uuid, uuid, text) TO authenticated;

COMMENT ON COLUMN public.pages.collection_owner_id IS 'Denormalised from collections.owner_id so RLS avoids a join. Set by trigger; client values are ignored.';

COMMENT ON COLUMN public.pages.rank IS 'Lexorank string. MUST stay `text collate "C"` to match JS bytewise ordering.';

COMMENT ON COLUMN public.pages.is_published_tree IS 'Maintained by trigger. True only when this page and every ancestor are published. A page with published_at set but is_published_tree false is the "Hidden" state.';

ALTER TABLE public.pages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_collection_id_fkey FOREIGN KEY (collection_id) REFERENCES public.collections(id) ON DELETE CASCADE;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id);

ALTER TABLE public.pages
  ADD CONSTRAINT pages_not_own_ancestor CHECK (NOT (id = ANY (ancestor_ids)));

ALTER TABLE public.pages
  ADD CONSTRAINT pages_pkey PRIMARY KEY (id);

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;

ALTER TABLE public.page_stars
  ADD CONSTRAINT page_stars_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;

ALTER TABLE public.page_views
  ADD CONSTRAINT page_views_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.pages(id) ON DELETE CASCADE;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.pages(id) ON DELETE CASCADE;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_title_length CHECK (length(title) >= 1 AND length(title) <= 255);

GRANT ALL ON public.pages TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.pages TO service_role;

CREATE INDEX pages_level_idx ON public.pages (collection_id, parent_id, rank)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX pages_sibling_rank_key ON public.pages (collection_id, parent_id, rank)
  WHERE deleted_at IS NULL;

CREATE INDEX pages_recent_idx ON public.pages (parent_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX pages_parent_idx ON public.pages (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX pages_created_by_idx ON public.pages (created_by);

CREATE INDEX pages_ancestors_idx ON public.pages USING gin (ancestor_ids);

CREATE INDEX pages_workspace_idx ON public.pages (workspace_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER pages_guard_trash
  BEFORE UPDATE ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.pages_guard_trash();

CREATE TRIGGER pages_set_scope
  BEFORE INSERT OR UPDATE OF collection_id, parent_id ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.pages_set_scope();

CREATE TRIGGER pages_set_updated_at
  BEFORE UPDATE ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER pages_stamp_editor
  BEFORE UPDATE OF title, content ON public.pages
  FOR EACH ROW
  EXECUTE FUNCTION public.pages_stamp_editor();

CREATE TRIGGER pages_tree_sync
  AFTER UPDATE OF parent_id, published_at ON public.pages
  FOR EACH ROW
  WHEN (old.parent_id IS DISTINCT FROM new.parent_id OR old.published_at IS DISTINCT FROM new.published_at)
  EXECUTE FUNCTION public.pages_after_tree_change();

CREATE POLICY pages_delete ON public.pages
  FOR DELETE
  TO authenticated
  USING ((public.is_workspace_member(workspace_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR public.is_workspace_admin(workspace_id))));

CREATE POLICY pages_insert ON public.pages
  FOR INSERT
  TO authenticated
  WITH
    CHECK
    ((public.can_write_in_workspace(workspace_id) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((collection_owner_id IS NULL) OR (collection_owner_id = ( SELECT auth.uid() AS
    uid)))));

CREATE POLICY pages_select_live ON public.pages
  FOR SELECT
  TO authenticated
  USING
    (((deleted_at IS NULL) AND public.is_workspace_member(workspace_id) AND ((collection_owner_id IS NULL) OR (collection_owner_id = ( SELECT auth.uid() AS uid))) AND
    (is_published_tree OR (created_by = ( SELECT auth.uid() AS uid)))));

CREATE POLICY pages_select_trash ON public.pages
  FOR SELECT
  TO authenticated
  USING (((deleted_at IS NOT NULL) AND public.is_workspace_member(workspace_id) AND ((created_by = ( SELECT auth.uid() AS uid)) OR public.is_workspace_admin(workspace_id))));

CREATE POLICY pages_update ON public.pages
  FOR UPDATE
  TO authenticated
  USING
    (((deleted_at IS NULL) AND public.can_write_in_workspace(workspace_id) AND ((collection_owner_id IS NULL) OR (collection_owner_id = ( SELECT auth.uid() AS uid))) AND
    (is_published_tree OR (created_by = ( SELECT auth.uid() AS uid)))))
  WITH CHECK ((public.can_write_in_workspace(workspace_id) AND ((collection_owner_id IS NULL) OR (collection_owner_id = ( SELECT auth.uid() AS uid)))));

CREATE TABLE public.profiles (
  id           uuid                     NOT NULL,
  username     text                     NOT NULL,
  full_name    text,
  display_name text,
  avatar_path  text,
  bio          text,
  job_title    text,
  company      text,
  location     text,
  website      text,
  pronouns     text,
  timezone     text                     DEFAULT 'UTC'::text NOT NULL,
  locale       text                     DEFAULT 'en'::text NOT NULL,
  onboarded_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON COLUMN public.profiles.avatar_path IS 'Object path inside the `avatars` storage bucket, e.g. `<user_id>/avatar.webp`. Never a full URL - build it client-side.';

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR length(bio) <= 500);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.collections
  ADD CONSTRAINT collections_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.collections
  ADD CONSTRAINT collections_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.page_stars
  ADD CONSTRAINT page_stars_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.page_views
  ADD CONSTRAINT page_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_collection_owner_id_fkey FOREIGN KEY (collection_owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_last_edited_by_fkey FOREIGN KEY (last_edited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$'::text);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_lowercase CHECK (username = lower(username));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_website_format CHECK (website IS NULL OR website ~* '^https?://'::text);

GRANT ALL ON public.profiles TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.profiles TO service_role;

CREATE UNIQUE INDEX profiles_username_key ON public.profiles (username);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (((id = ( SELECT auth.uid() AS uid)) OR public.shares_workspace_with(id)));

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((id = ( SELECT auth.uid() AS uid)));

CREATE TABLE public.workspace_invitations (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  email        text                     NOT NULL,
  role         public.workspace_role    DEFAULT 'member'::public.workspace_role NOT NULL,
  token_hash   text                     NOT NULL,
  invited_by   uuid                     NOT NULL,
  expires_at   timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  accepted_at  timestamp with time zone,
  accepted_by  uuid,
  revoked_at   timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.workspace_invitations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text);

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_email_lowercase CHECK (email = lower(email));

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_pkey PRIMARY KEY (id);

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_role_not_owner CHECK (role <> 'owner'::public.workspace_role);

GRANT ALL ON public.workspace_invitations TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workspace_invitations TO service_role;

CREATE UNIQUE INDEX workspace_invitations_pending_key ON public.workspace_invitations (workspace_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX workspace_invitations_token_key ON public.workspace_invitations (token_hash);

CREATE INDEX workspace_invitations_email_idx ON public.workspace_invitations (email);

CREATE POLICY workspace_invitations_delete ON public.workspace_invitations
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_admin(workspace_id));

CREATE POLICY workspace_invitations_insert ON public.workspace_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK ((public.is_workspace_admin(workspace_id) AND (invited_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY workspace_invitations_select ON public.workspace_invitations
  FOR SELECT
  TO authenticated
  USING ((public.is_workspace_admin(workspace_id) OR (email = lower(( SELECT (auth.jwt() ->> 'email'::text))))));

CREATE POLICY workspace_invitations_update ON public.workspace_invitations
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE TABLE public.workspace_members (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  workspace_id uuid                     NOT NULL,
  user_id      uuid                     NOT NULL,
  role         public.workspace_role    DEFAULT 'member'::public.workspace_role NOT NULL,
  invited_by   uuid,
  joined_at    timestamp with time zone DEFAULT now() NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.workspace_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_unique UNIQUE (workspace_id, user_id);

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

GRANT ALL ON public.workspace_members TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workspace_members TO service_role;

CREATE INDEX workspace_members_user_idx ON public.workspace_members (user_id, workspace_id);

CREATE TRIGGER workspace_members_immutable_keys
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_members_immutable_keys();

CREATE TRIGGER workspace_members_protect_last_owner
  BEFORE DELETE OR UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.workspace_members_protect_last_owner();

CREATE TRIGGER workspace_members_set_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY workspace_members_delete ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING ((public.is_workspace_admin(workspace_id) OR (user_id = ( SELECT auth.uid() AS uid))));

CREATE POLICY workspace_members_insert ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE POLICY workspace_members_select ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY workspace_members_update ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));

CREATE TABLE public.workspaces (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name        text                     DEFAULT 'Untitled workspace'::text NOT NULL,
  slug        text                     NOT NULL,
  description text,
  icon        text,
  logo_path   text,
  is_personal boolean                  DEFAULT false NOT NULL,
  created_by  uuid                     NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at  timestamp with time zone
);

CREATE FUNCTION public.create_workspace (
  p_name text,
  p_slug text DEFAULT NULL::text
)
  RETURNS public.workspaces
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_slug text;
  v_ws   public.workspaces%rowtype;
begin
  v_slug := regexp_replace(lower(coalesce(p_slug, p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');
  v_slug := left(nullif(v_slug, ''), 40);

  if v_slug is null or length(v_slug) < 3 then
    v_slug := 'workspace';
  end if;

  if exists (select 1 from public.workspaces w where w.slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  insert into public.workspaces (name, slug, created_by)
  values (p_name, v_slug, (select auth.uid()))
  returning * into v_ws;

  return v_ws;
end;
$function$;

GRANT ALL ON FUNCTION public.create_workspace(text, text) TO authenticated;

ALTER TABLE public.workspaces
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.collections
  ADD CONSTRAINT collections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.pages
  ADD CONSTRAINT pages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_slug_format CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'::text);

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_slug_lowercase CHECK (slug = lower(slug));

GRANT ALL ON public.workspaces TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.workspaces TO service_role;

CREATE UNIQUE INDEX workspaces_slug_key ON public.workspaces (slug);

CREATE INDEX workspaces_created_by_idx ON public.workspaces (created_by);

CREATE TRIGGER workspaces_seat_owner
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.workspaces_seat_owner();

CREATE TRIGGER workspaces_set_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY workspaces_delete ON public.workspaces
  FOR DELETE
  TO authenticated
  USING (public.is_workspace_owner(id));

CREATE POLICY workspaces_insert ON public.workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));

CREATE POLICY workspaces_select ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (((deleted_at IS NULL) AND public.is_workspace_member(id)));

CREATE POLICY workspaces_update ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_admin(id))
  WITH CHECK (public.is_workspace_admin(id));
-- =============================================================================
-- HAND-WRITTEN TAIL
-- =============================================================================
-- `supabase db diff` does not round-trip everything in supabase/schemas/. Three
-- categories are dropped silently and are restored below. If a later diff wants
-- to drop and recreate one of the sibling-rank indexes, the NULLS NOT DISTINCT
-- clause was lost again and belongs back in this section.
--
--   1. NULLS NOT DISTINCT on the sibling-rank unique indexes
--   2. the entire `storage` schema (object policies)
--   3. REVOKEs against `anon`

-- -----------------------------------------------------------------------------
-- 1. NULLS NOT DISTINCT
-- -----------------------------------------------------------------------------
-- Without this clause the null side of each scope is unconstrained: shared
-- collections (owner_id null) and root pages (parent_id null) would silently
-- collide on rank. See CLAUDE.md invariant 2.

DROP INDEX IF EXISTS public.collections_scope_rank_key;

CREATE UNIQUE INDEX collections_scope_rank_key
  ON public.collections (workspace_id, owner_id, rank)
  NULLS NOT DISTINCT
  WHERE deleted_at IS NULL;

DROP INDEX IF EXISTS public.pages_sibling_rank_key;

CREATE UNIQUE INDEX pages_sibling_rank_key
  ON public.pages (collection_id, parent_id, rank)
  NULLS NOT DISTINCT
  WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 2. storage.objects policies
-- -----------------------------------------------------------------------------
-- Mirrors supabase/schemas/11_storage.sql verbatim. The buckets themselves are
-- DML and live in supabase/seed.sql.
--
-- Path conventions are load-bearing - each policy authorizes by reading the
-- first folder segment:
--
--   avatars/         <user_id>/<filename>
--   workspace-logos/ <workspace_id>/<filename>
--   attachments/     <workspace_id>/<page_id>/<uuid>-<filename>

CREATE POLICY "avatars are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "users manage their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.safe_uuid((storage.foldername(name))[1]) = (SELECT auth.uid())
  );

CREATE POLICY "users replace their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.safe_uuid((storage.foldername(name))[1]) = (SELECT auth.uid())
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND public.safe_uuid((storage.foldername(name))[1]) = (SELECT auth.uid())
  );

CREATE POLICY "users delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND public.safe_uuid((storage.foldername(name))[1]) = (SELECT auth.uid())
  );

CREATE POLICY "workspace logos are publicly readable"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'workspace-logos');

CREATE POLICY "workspace admins write logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  );

CREATE POLICY "workspace admins replace logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  )
  WITH CHECK (
    bucket_id = 'workspace-logos'
    AND public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  );

CREATE POLICY "workspace admins delete logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workspace-logos'
    AND public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  );

CREATE POLICY "workspace members read attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND public.is_workspace_member(public.safe_uuid((storage.foldername(name))[1]))
  );

CREATE POLICY "workspace members upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND owner = (SELECT auth.uid())
    AND public.can_write_in_workspace(public.safe_uuid((storage.foldername(name))[1]))
  );

CREATE POLICY "uploaders replace their attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'attachments' AND owner = (SELECT auth.uid()))
  WITH CHECK (bucket_id = 'attachments' AND owner = (SELECT auth.uid()));

CREATE POLICY "attachment objects follow attachment rows"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      owner = (SELECT auth.uid())
      OR public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
      OR EXISTS (
        SELECT 1
        FROM public.attachments a
        WHERE a.bucket_id = 'attachments'
          AND a.storage_path = storage.objects.name
          AND a.page_id IS NOT NULL
          AND public.can_write_page(a.page_id)
      )
    )
  );

-- -----------------------------------------------------------------------------
-- 3. REVOKEs against anon
-- -----------------------------------------------------------------------------
-- Mirrors supabase/schemas/13_grants.sql. Nothing in Kortex is world-readable,
-- so anon holds no table, sequence or helper-function access at all.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

REVOKE EXECUTE ON FUNCTION
  public.is_workspace_member(uuid),
  public.workspace_role_of(uuid),
  public.is_workspace_admin(uuid),
  public.is_workspace_owner(uuid),
  public.can_write_in_workspace(uuid),
  public.shares_workspace_with(uuid),
  public.can_read_page(uuid),
  public.can_write_page(uuid),
  public.move_page(uuid, uuid, uuid, text),
  public.pages_recompute_subtree(uuid),
  public.generate_username(text, uuid),
  public.accept_workspace_invitation(text),
  public.create_workspace_invitation(uuid, text, public.workspace_role)
FROM anon;
