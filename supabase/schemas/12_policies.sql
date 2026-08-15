-- =============================================================================
-- Row Level Security
-- =============================================================================
-- RLS is the only authorization layer in Kortex. There is no server-side
-- permission check to fall back on, which means:
--   * every policy is scoped `to authenticated` - anon reaches nothing;
--   * the service role key must never appear in a Route Handler that serves a
--     user request, because it bypasses everything on this page.
--
-- Note: FORCE ROW LEVEL SECURITY is deliberately *not* used. The helper
-- functions in `08_functions.sql` are SECURITY DEFINER and run as the table owner; forcing RLS
-- would subject them to the very policies they exist to evaluate, which is the
-- infinite recursion they were written to avoid.

alter table public.profiles              enable row level security;
alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.collections           enable row level security;
alter table public.pages                 enable row level security;
alter table public.page_stars            enable row level security;
alter table public.page_views            enable row level security;
alter table public.attachments           enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace_with(id));

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy: profiles disappear when the auth.users row does.

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (deleted_at is null and public.is_workspace_member(id));

create policy workspaces_insert on public.workspaces
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy workspaces_update on public.workspaces
  for update to authenticated
  using (public.is_workspace_admin(id))
  with check (public.is_workspace_admin(id));

create policy workspaces_delete on public.workspaces
  for delete to authenticated
  using (public.is_workspace_owner(id));

-- -----------------------------------------------------------------------------
-- workspace_members
-- -----------------------------------------------------------------------------

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Direct inserts are admin-only. Invited users arrive through
-- accept_workspace_invitation(), which is SECURITY DEFINER.
create policy workspace_members_insert on public.workspace_members
  for insert to authenticated
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_members_update on public.workspace_members
  for update to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- Admins remove people; anyone may leave (the last-owner trigger still applies).
create policy workspace_members_delete on public.workspace_members
  for delete to authenticated
  using (public.is_workspace_admin(workspace_id) or user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- workspace_invitations
-- -----------------------------------------------------------------------------

create policy workspace_invitations_select on public.workspace_invitations
  for select to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or email = lower((select auth.jwt() ->> 'email'))
  );

create policy workspace_invitations_insert on public.workspace_invitations
  for insert to authenticated
  with check (
    public.is_workspace_admin(workspace_id)
    and invited_by = (select auth.uid())
  );

create policy workspace_invitations_update on public.workspace_invitations
  for update to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_invitations_delete on public.workspace_invitations
  for delete to authenticated
  using (public.is_workspace_admin(workspace_id));

-- -----------------------------------------------------------------------------
-- collections
-- -----------------------------------------------------------------------------
-- Two SELECT policies, OR'd together: the live tree for everyone, plus a trash
-- view for people entitled to restore. Clients filter `deleted_at=is.null`
-- normally and `deleted_at=not.is.null` for the trash screen.

create policy collections_select_live on public.collections
  for select to authenticated
  using (
    deleted_at is null
    and public.is_workspace_member(workspace_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

create policy collections_select_trash on public.collections
  for select to authenticated
  using (
    deleted_at is not null
    and public.is_workspace_member(workspace_id)
    and (
      owner_id = (select auth.uid())
      or created_by = (select auth.uid())
      or (owner_id is null and public.is_workspace_admin(workspace_id))
    )
  );

create policy collections_insert on public.collections
  for insert to authenticated
  with check (
    public.can_write_in_workspace(workspace_id)
    and created_by = (select auth.uid())
    and (owner_id is null or owner_id = (select auth.uid()))
  );

-- Shared collections are collaboratively editable; private ones are not.
-- The destructive half of UPDATE (setting deleted_at) is narrowed further by
-- collections_guard_trash.
create policy collections_update on public.collections
  for update to authenticated
  using (
    public.can_write_in_workspace(workspace_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  )
  with check (
    public.can_write_in_workspace(workspace_id)
    and (owner_id is null or owner_id = (select auth.uid()))
  );

create policy collections_delete on public.collections
  for delete to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      owner_id = (select auth.uid())
      or created_by = (select auth.uid())
      or public.is_workspace_admin(workspace_id)
    )
  );

-- -----------------------------------------------------------------------------
-- pages
-- -----------------------------------------------------------------------------
-- This is the hierarchical publishing rule, and it is three column comparisons
-- because the tree state is materialised:
--
--   is_published_tree = true   -> visible to the workspace
--   published_at set, tree false -> "Hidden": author-only until the ancestors publish
--   published_at null          -> "Draft": author-only

create policy pages_select_live on public.pages
  for select to authenticated
  using (
    deleted_at is null
    and public.is_workspace_member(workspace_id)
    and (collection_owner_id is null or collection_owner_id = (select auth.uid()))
    and (is_published_tree or created_by = (select auth.uid()))
  );

create policy pages_select_trash on public.pages
  for select to authenticated
  using (
    deleted_at is not null
    and public.is_workspace_member(workspace_id)
    and (created_by = (select auth.uid()) or public.is_workspace_admin(workspace_id))
  );

-- workspace_id and collection_owner_id are stamped by pages_set_scope before
-- this runs, so the values checked here are derived, not client-supplied.
create policy pages_insert on public.pages
  for insert to authenticated
  with check (
    public.can_write_in_workspace(workspace_id)
    and created_by = (select auth.uid())
    and (collection_owner_id is null or collection_owner_id = (select auth.uid()))
  );

create policy pages_update on public.pages
  for update to authenticated
  using (
    deleted_at is null
    and public.can_write_in_workspace(workspace_id)
    and (collection_owner_id is null or collection_owner_id = (select auth.uid()))
    and (is_published_tree or created_by = (select auth.uid()))
  )
  with check (
    public.can_write_in_workspace(workspace_id)
    and (collection_owner_id is null or collection_owner_id = (select auth.uid()))
  );

create policy pages_delete on public.pages
  for delete to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (created_by = (select auth.uid()) or public.is_workspace_admin(workspace_id))
  );

-- -----------------------------------------------------------------------------
-- page_stars
-- -----------------------------------------------------------------------------

create policy page_stars_select on public.page_stars
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy page_stars_insert on public.page_stars
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_read_page(page_id));

create policy page_stars_update on public.page_stars
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy page_stars_delete on public.page_stars
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- page_views
-- -----------------------------------------------------------------------------
-- Readable by anyone who can read the page, so the reader-avatar stack on the
-- page overview works.

create policy page_views_select on public.page_views
  for select to authenticated
  using (public.can_read_page(page_id));

create policy page_views_insert on public.page_views
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_read_page(page_id));

create policy page_views_update on public.page_views
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy page_views_delete on public.page_views
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- attachments
-- -----------------------------------------------------------------------------
-- An upload with page_id already set must target a page you can edit. Orphan
-- uploads (page_id null, the editor's staging state) only need workspace write
-- access; attachments_set_scope stamps workspace_id once a page is attached.
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.can_write_in_workspace(workspace_id)
    and (page_id is null or public.can_write_page(page_id))
  );
 
-- Anyone who can edit the page can edit its attachments. The uploader keeps
-- access to their own orphans so the editor can attach them after upload.
create policy attachments_update on public.attachments
  for update to authenticated
  using (
    (page_id is null and uploaded_by = (select auth.uid()))
    or (page_id is not null and public.can_write_page(page_id))
  )
  with check (
    public.can_write_in_workspace(workspace_id)
    and (
      (page_id is null and uploaded_by = (select auth.uid()))
      or (page_id is not null and public.can_write_page(page_id))
    )
  );
 
create policy attachments_delete on public.attachments
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    or (page_id is not null and public.can_write_page(page_id))
    or public.is_workspace_admin(workspace_id)
  );
