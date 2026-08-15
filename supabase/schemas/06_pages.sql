create table public.pages (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  collection_id      uuid not null references public.collections(id) on delete cascade,
  collection_owner_id uuid references public.profiles(id) on delete cascade,
  parent_id          uuid references public.pages(id) on delete cascade,

  title              text not null default 'Untitled',
  content            jsonb not null default '{}'::jsonb,
  published_at       timestamptz,
  rank               text collate "C" not null,

  depth              int generated always as (coalesce(array_length(ancestor_ids, 1), 0)) stored,
  ancestor_ids       uuid[] not null default '{}',
  is_published_tree  boolean not null default false,

  created_by         uuid not null references public.profiles(id) on delete restrict,
  last_edited_by     uuid references public.profiles(id) on delete set null,
  last_edited_at     timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz

  constraint pages_title_length check (length(title) between 1 and 255),
  constraint pages_no_self_parent check (parent_id is null or parent_id <> id),
  constraint pages_not_own_ancestor check (not (id = any (ancestor_ids)))
);

comment on column public.pages.rank is
  'Lexorank string. MUST stay `text collate "C"` to match JS bytewise ordering.';
comment on column public.pages.is_published_tree is
  'Maintained by trigger. True only when this page and every ancestor are published. A page with published_at set but is_published_tree false is the "Hidden" state.';
comment on column public.pages.collection_owner_id is
  'Denormalised from collections.owner_id so RLS avoids a join. Set by trigger; client values are ignored.';

-- Sibling ordering. NULLS NOT DISTINCT is required for root pages, where
-- parent_id is null - otherwise root siblings escape the uniqueness check.
create unique index pages_sibling_rank_key
  on public.pages (collection_id, parent_id, rank)
  nulls not distinct
  where deleted_at is null;

-- Sidebar loads one level at a time; this is the index it rides on.
create index pages_level_idx
  on public.pages (collection_id, parent_id, rank)
  where deleted_at is null;

create index pages_workspace_idx on public.pages (workspace_id) where deleted_at is null;
create index pages_parent_idx on public.pages (parent_id) where parent_id is not null;
create index pages_created_by_idx on public.pages (created_by);
create index pages_ancestors_idx on public.pages using gin (ancestor_ids);
create index pages_recent_idx on public.pages (parent_id, updated_at desc) where deleted_at is null;

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();
