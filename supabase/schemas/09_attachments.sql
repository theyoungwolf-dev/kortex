create table public.attachments (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  page_id       uuid        references public.pages(id) on delete cascade,
  bucket_id     text        not null default 'attachments',
  storage_path  text        not null,
  file_name     text        not null,
  mime_type     text        not null,
  size_bytes    bigint      not null,
  width         int,
  height        int,
  checksum      text,
  uploaded_by   uuid        not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),

  constraint attachments_size_positive check (size_bytes > 0)
);

create unique index attachments_storage_path_key on public.attachments(bucket_id, storage_path);
create index attachments_page_idx on public.attachments(page_id);
create index attachments_workspace_idx on public.attachments(workspace_id);
