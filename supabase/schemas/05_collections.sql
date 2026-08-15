create table public.collections (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  owner_id        uuid references public.profiles(id) on delete cascade,
  name            text not null default 'Untitled',
  description     text,
  icon            text,
  rank            text collate "C" not null,
  created_by      uuid not null references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint collections_name_length check (length(name) between 1 and 255),
  constraint collections_description_length
    check (description is null or length(description) <= 255),
  constraint collections_icon_length check (icon is null or length(icon) <= 50)
);

-- `collate "C"` makes Postgres compare ranks bytewise, matching how JavaScript
-- compares the strings produced by @theyoungwolf/lexorank. Under any linguistic
-- collation the two orderings diverge and the sidebar silently reorders itself.
comment on column public.collections.rank is
  'Lexorank string. MUST stay `text collate "C"` to match JS bytewise ordering.';

-- NULLS NOT DISTINCT is required: without it, two shared collections
-- (owner_id IS NULL) could take the same rank in the same workspace.
create unique index collections_scope_rank_key
  on public.collections (workspace_id, owner_id, rank)
  nulls not distinct
  where deleted_at is null;
 
create index collections_workspace_idx
  on public.collections (workspace_id, owner_id, rank)
  where deleted_at is null;
 
create index collections_owner_idx on public.collections (owner_id)
  where owner_id is not null;
 
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();
