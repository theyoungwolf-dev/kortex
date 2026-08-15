create table public.workspaces (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null default 'Untitled workspace',
  slug        text        not null,
  description text,
  icon        text,
  logo_path   text,
  is_personal boolean     not null default false,
  created_by  uuid        not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint workspaces_slug_lowercase check (slug = lower(slug)),
  constraint workspaces_slug_format
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$')
);

create unique index workspaces_slug_key on public.workspaces(slug);
create index workspaces_created_by_idx on public.workspaces(created_by);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

create table public.workspace_members (
  id           uuid                  primary key default gen_random_uuid(),
  workspace_id uuid                  not null references public.workspaces(id) on delete cascade,
  user_id      uuid                  not null references public.profiles(id) on delete cascade,
  role         public.workspace_role not null default 'member',
  invited_by   uuid                  references public.profiles(id) on delete set null,
  joined_at    timestamptz           not null default now(),
  created_at   timestamptz           not null default now(),
  updated_at   timestamptz           not null default now(),

  constraint workspace_members_unique unique (workspace_id, user_id)
);

-- Every RLS check in the schema funnels through this table, so both access
-- directions need to be indexed.
create index workspace_members_user_idx on public.workspace_members(user_id, workspace_id);

create trigger workspace_members_set_updated_at
  before update on public.workspace_members
  for each row execute function public.set_updated_at();

create table public.workspace_invitations (
  id           uuid                  primary key default gen_random_uuid(),
  workspace_id uuid                  not null references public.workspaces(id) on delete cascade,
  email        text                  not null,
  role         public.workspace_role not null default 'member',
  token_hash   text                  not null,
  invited_by   uuid                  not null references public.profiles(id) on delete cascade,
  expires_at   timestamptz           not null default now() + interval '7 days',
  accepted_at  timestamptz,
  accepted_by  uuid                  references public.profiles(id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz           not null default now(),

  constraint workspace_invitations_email_lowercase check (email = lower(email)),
  constraint workspace_invitations_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint workspace_invitations_role_not_owner check (role <> 'owner')
);

create unique index workspace_invitations_token_key
  on public.workspace_invitations(token_hash);

-- At most one live invitation per (workspace, email).
create unique index workspace_invitations_pending_key
  on public.workspace_invitations(workspace_id, email)
  where accepted_at is null and revoked_at is null;

create index workspace_invitations_email_idx on public.workspace_invitations(email);

-- A workspace must never be left without an owner.
create or replace function public.workspace_members_protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create trigger workspace_members_protect_last_owner
  before update or delete on public.workspace_members
  for each row execute function public.workspace_members_protect_last_owner();

-- Membership rows never migrate between workspaces or people.
create or replace function public.workspace_members_immutable_keys()
returns trigger
language plpgsql
as $$
begin
  if new.workspace_id <> old.workspace_id or new.user_id <> old.user_id then
    raise exception 'workspace_id and user_id are immutable on workspace_members'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger workspace_members_immutable_keys
  before update on public.workspace_members
  for each row execute function public.workspace_members_immutable_keys();

-- Whoever creates a workspace is seated as its owner. Uses created_by rather
-- than auth.uid() so it also works from the signup provisioning trigger, where
-- there is no JWT in scope.
create or replace function public.workspaces_seat_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

create trigger workspaces_seat_owner
  after insert on public.workspaces
  for each row execute function public.workspaces_seat_owner();


-- -----------------------------------------------------------------------------
-- generate_workspace_slug
-- -----------------------------------------------------------------------------
-- Shared by create_workspace and rename_workspace so the two paths cannot
-- drift. p_exclude_id keeps a rename from colliding with the row being renamed
-- - without it, renaming a workspace to the slug it already holds would look
-- like a collision and pick up a pointless entropy suffix.
--
-- SECURITY DEFINER is required for correctness here, not for permissions.
-- `workspaces.slug` is unique across the whole table, but workspaces_select only
-- shows a caller the workspaces they belong to. Under INVOKER the existence
-- probe below silently misses every slug owned by somebody else, the check
-- passes, and the write then fails on the unique index with a raw 23505 - the
-- classic "RLS returns emptiness, not errors" trap.
--
-- The widened visibility is bounded to exactly that: the function takes a name
-- and returns a slug. It exposes whether a slug is taken, which attempting to
-- claim one already reveals, and nothing about any workspace's contents.

create or replace function public.generate_workspace_slug(
  p_name       text,
  p_exclude_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

-- Both create_workspace and rename_workspace are SECURITY INVOKER, so EXECUTE on
-- everything they call is checked against the caller. `authenticated` therefore
-- needs it on the helpers too; RLS, not the grant, is what stops a caller using
-- them somewhere they have no business writing.
revoke execute on function public.generate_workspace_slug(text, uuid) from public, anon;
grant execute on function public.generate_workspace_slug(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- seed_workspace_content
-- -----------------------------------------------------------------------------
-- The starter collection and welcome page every workspace begins with. Called
-- from two places with different privilege contexts, and correct in both:
--
--   handle_new_user   - runs SECURITY DEFINER as the table owner, so RLS is
--                       bypassed (policies are enabled but not FORCEd) and
--                       auth.uid() is null; the caller passes the new user id.
--   create_workspace  - runs as the authenticated caller, who already holds an
--                       owner seat by this point (workspaces_seat_owner is an
--                       AFTER INSERT trigger), so collections_insert and
--                       pages_insert both pass.
--
-- The collection is private to the creator, matching the original signup
-- behaviour. Making starter content workspace-visible is a product decision,
-- not a refactor - change it deliberately if you want it.

create or replace function public.seed_workspace_content(
  p_workspace_id uuid,
  p_user_id      uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke execute on function public.seed_workspace_content(uuid, uuid) from public, anon;
grant execute on function public.seed_workspace_content(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- create_workspace
-- -----------------------------------------------------------------------------
-- Convenience wrapper: slug collisions are resolved server-side rather than by
-- optimistic retry from the client. SECURITY INVOKER, so RLS still applies.

-- The insert deliberately does NOT use `returning *`. RETURNING is evaluated
-- during the INSERT statement, so it is subject to workspaces_select - which
-- requires membership - while the owner seat is created by workspaces_seat_owner,
-- an AFTER INSERT trigger that has not fired yet. The row is therefore inserted
-- with a pre-generated id and read back in a later statement, by which point the
-- seat exists and the SELECT policy passes. Reaching for SECURITY DEFINER here
-- would "fix" the error by removing the check instead of satisfying it.

create or replace function public.create_workspace(p_name text, p_slug text default null)
returns public.workspaces
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

grant execute on function public.create_workspace(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- rename_workspace
-- -----------------------------------------------------------------------------
-- Onboarding step 2: the signup trigger has already created a workspace named
-- "<username>'s workspace"; this is where the user names it for real.
--
-- An RPC rather than a plain PostgREST update because naming is a check-then-act
-- against a uniquely-indexed column: the slug has to be derived, tested for
-- collision, and written without another session claiming it in between. That
-- is the "single transaction is genuinely required" case CLAUDE.md allows.
--
-- SECURITY INVOKER, so the workspaces_update policy (admin only) still decides
-- who may do it. A caller who is not an admin - or names a workspace that does
-- not exist - updates zero rows, which is reported as a permission error rather
-- than passing silently.

create or replace function public.rename_workspace(
  p_workspace_id uuid,
  p_name         text,
  p_slug         text default null
)
returns public.workspaces
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke execute on function public.rename_workspace(uuid, text, text) from public, anon;
grant execute on function public.rename_workspace(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- create_workspace_invitation
-- -----------------------------------------------------------------------------
-- Returns the raw token exactly once. Only its hash is stored, so the invite
-- link cannot be reconstructed from the database. Call this from a Route Handler
-- with the *user's* session client - never the service role key - then send the
-- link yourself.

create or replace function public.create_workspace_invitation(
  p_workspace_id uuid,
  p_email        text,
  p_role         public.workspace_role default 'member'
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function
  public.create_workspace_invitation(uuid, text, public.workspace_role)
from public, anon;

grant execute on function
  public.create_workspace_invitation(uuid, text, public.workspace_role)
to authenticated;

-- -----------------------------------------------------------------------------
-- accept_workspace_invitation
-- -----------------------------------------------------------------------------
-- The invitee is not yet a member, so no RLS policy could let them insert their
-- own membership row. This is the one sanctioned way in.

create or replace function public.accept_workspace_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.accept_workspace_invitation(text) from public, anon;
grant execute on function public.accept_workspace_invitation(text) to authenticated;
