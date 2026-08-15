
-- =============================================================================
-- Authorization helpers
-- =============================================================================
-- Every one of these is SECURITY DEFINER for a specific reason: a policy on
-- workspace_members that queries workspace_members would recurse infinitely.
-- Running the lookup as the definer takes RLS out of the inner query and breaks
-- the cycle. They are all STABLE (planner may cache within a statement) and
-- pinned to an empty search_path so a rogue schema cannot shadow `public`.
--
-- auth.uid() is always wrapped in a scalar subquery - `(select auth.uid())` -
-- so Postgres evaluates it once per statement instead of once per row.

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.workspace_role_of(p_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.workspace_members m
  where m.workspace_id = p_workspace_id
    and m.user_id = (select auth.uid());
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_role_of(p_workspace_id) = 'owner';
$$;

-- Guests read but never write.
create or replace function public.can_write_in_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.workspace_role_of(p_workspace_id) in ('owner', 'admin', 'member');
$$;

-- Profile visibility: you can see someone if you share at least one workspace.
create or replace function public.shares_workspace_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members me
    join public.workspace_members them on them.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid())
      and them.user_id = p_user_id
  );
$$;

-- Single source of truth for "may this person read this page", reused by
-- page_stars, page_views and attachments so the rule cannot drift.
create or replace function public.can_read_page(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and p.deleted_at is null
      and public.is_workspace_member(p.workspace_id)
      and (p.collection_owner_id is null or p.collection_owner_id = (select auth.uid()))
      and (p.is_published_tree or p.created_by = (select auth.uid()))
  );
$$;

create or replace function public.can_write_page(p_page_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and p.deleted_at is null
      and public.can_write_in_workspace(p.workspace_id)
      and (p.collection_owner_id is null or p.collection_owner_id = (select auth.uid()))
      and (p.is_published_tree or p.created_by = (select auth.uid()))
  );
$$;

-- Rewrites ancestor_ids and is_published_tree for a page and everything beneath
-- it. Run once on write instead of once per read.
--
-- The trailing `is distinct from` guard makes it idempotent - a recompute that
-- changes nothing updates zero rows and therefore fires no further triggers.
create or replace function public.pages_recompute_subtree(p_root uuid)
returns void
language sql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.pages_recompute_subtree(uuid) from public, anon, authenticated;

-- Derives every denormalised column from the parent and the collection, and
-- rejects structurally invalid moves. Because this is a BEFORE trigger, the RLS
-- WITH CHECK clause sees the corrected row - so a client cannot smuggle in a
-- workspace_id it has no membership in.
create or replace function public.pages_set_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- The column list is load-bearing and must not be widened. pages_recompute_subtree
-- writes ancestor_ids and is_published_tree; if either of those appeared in the
-- UPDATE OF list, the trigger would re-enter itself.
create or replace function public.pages_after_tree_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.pages_recompute_subtree(new.id);
  return null;
end;
$$;

create or replace function public.pages_stamp_editor()
returns trigger
language plpgsql
as $$
begin
  new.created_by     := old.created_by;   -- authorship is immutable
  new.last_edited_by := coalesce((select auth.uid()), old.last_edited_by);
  new.last_edited_at := now();
  return new;
end;
$$;

-- Trash is an UPDATE (setting deleted_at), which means the ordinary UPDATE
-- policy would let any member bin a shared collection. Permission for the
-- destructive half of UPDATE is therefore enforced here, where OLD and NEW are
-- both visible.
create or replace function public.collections_guard_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.pages_guard_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Trashing a collection trashes its live pages; restoring brings back the ones
-- that went down with it.
create or replace function public.collections_cascade_trash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- dnd-kit produces all three changes at once, so they belong in one transaction.
-- SECURITY DEFINER bypasses RLS, which means permission is re-checked by hand
-- at the top. p_rank comes from lib/rank/.
create or replace function public.move_page(
  p_page_id       uuid,
  p_collection_id uuid,
  p_parent_id     uuid,
  p_rank          text
)
returns public.pages
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Now that an attachment can be re-pointed at a different page by someone other
-- than its uploader, workspace_id must be derived rather than trusted - the same
-- reasoning as pages_set_scope. Without this, re-pointing page_id would leave a
-- stale workspace_id and the row would answer to the wrong tenant's policies.
create or replace function public.attachments_set_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- -----------------------------------------------------------------------------
-- Execution grants
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER functions are only ever safe when the public role cannot
-- reach them, so revoke first and grant back deliberately.

revoke execute on function
  public.is_workspace_member(uuid),
  public.workspace_role_of(uuid),
  public.is_workspace_admin(uuid),
  public.is_workspace_owner(uuid),
  public.can_write_in_workspace(uuid),
  public.shares_workspace_with(uuid),
  public.can_read_page(uuid),
  public.can_write_page(uuid),
  public.move_page(uuid, uuid, uuid, text)
from public, anon;

grant execute on function
  public.is_workspace_member(uuid),
  public.workspace_role_of(uuid),
  public.is_workspace_admin(uuid),
  public.is_workspace_owner(uuid),
  public.can_write_in_workspace(uuid),
  public.shares_workspace_with(uuid),
  public.can_read_page(uuid),
  public.can_write_page(uuid),
  public.move_page(uuid, uuid, uuid, text)
to authenticated;
