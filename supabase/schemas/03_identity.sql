create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text        not null,
  full_name     text,
  display_name  text,
  avatar_path   text,
  bio           text,
  job_title     text,
  company       text,
  location      text,
  website       text,
  pronouns      text,
  timezone      text        not null default 'UTC',
  locale        text        not null default 'en',
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_username_lowercase check (username = lower(username)),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$'),
  constraint profiles_website_format
    check (website is null or website ~* '^https?://'),
  constraint profiles_bio_length check (bio is null or length(bio) <= 500)
);

create unique index profiles_username_key on public.profiles(username);

comment on column public.profiles.avatar_path is
  'Object path inside the `avatars` storage bucket, e.g. `<user_id>/avatar.webp`. Never a full URL - build it client-side.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Username generation
-- -----------------------------------------------------------------------------

create or replace function public.generate_username(p_seed text, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.generate_username(text, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- handle_new_user - fires on auth.users insert
-- -----------------------------------------------------------------------------
-- Gives every new account a profile, a personal workspace (membership is added
-- by the workspaces_seat_owner trigger), a starter collection and a published
-- welcome page. Metadata passed at signup as `options.data` lands in
-- raw_user_meta_data and is picked up here.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
