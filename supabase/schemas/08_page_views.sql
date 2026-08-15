create table public.page_views (
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  page_id         uuid        not null references public.pages(id) on delete cascade,
  view_count      int         not null default 1,
  first_viewed_at timestamptz not null default now(),
  viewed_at       timestamptz not null default now(),

  primary key (user_id, page_id)
);

create index page_views_page_idx on public.page_views(page_id, viewed_at desc);

-- -----------------------------------------------------------------------------
-- record_page_view
-- -----------------------------------------------------------------------------
-- A single upsert.

create or replace function public.record_page_view(p_page_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.page_views (user_id, page_id)
  values ((select auth.uid()), p_page_id)
  on conflict (user_id, page_id) do update
    set view_count = public.page_views.view_count + 1,
        viewed_at  = now();
$$;

grant execute on function public.record_page_view(uuid) to authenticated;
