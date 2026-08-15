create table public.page_stars (
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  page_id    uuid        not null references public.pages(id) on delete cascade,
  rank       text collate "C" not null,
  created_at timestamptz not null default now(),

  primary key (user_id, page_id),
  constraint page_stars_user_rank_key unique (user_id, rank)
);

create index page_stars_page_idx on public.page_stars(page_id);
