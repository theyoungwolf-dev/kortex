-- -----------------------------------------------------------------------------
-- avatars - public bucket, owner-writable
-- -----------------------------------------------------------------------------
-- `public` only affects reads through the /object/public endpoint. Writes still
-- need policies.

create policy "avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

create policy "users manage their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
  );

create policy "users replace their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
  )
  with check (
    bucket_id = 'avatars'
    and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
  );

create policy "users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and public.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
  );

-- -----------------------------------------------------------------------------
-- workspace-logos - public read, admin write
-- -----------------------------------------------------------------------------

create policy "workspace logos are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'workspace-logos');

create policy "workspace admins write logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'workspace-logos'
    and public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "workspace admins replace logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'workspace-logos'
    and public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  )
  with check (
    bucket_id = 'workspace-logos'
    and public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "workspace admins delete logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'workspace-logos'
    and public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
  );

-- -----------------------------------------------------------------------------
-- attachments - private, workspace-scoped
-- -----------------------------------------------------------------------------
-- Authorization is at workspace granularity rather than per-page: a signed URL
-- is only ever handed out by a client that already passed the page-level RLS
-- check on public.attachments, and per-object page lookups would put a join on
-- the hot path of every download.
--
-- safe_uuid() returns null on a malformed path, and is_workspace_member(null)
-- is false, so bad paths fail closed.

create policy "workspace members read attachments"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.is_workspace_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "workspace members upload attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and owner = (select auth.uid())
    and public.can_write_in_workspace(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy "uploaders replace their attachments"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'attachments' and owner = (select auth.uid()))
  with check (bucket_id = 'attachments' and owner = (select auth.uid()));

create policy "attachment objects follow attachment rows"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (
      owner = (select auth.uid())
      or public.is_workspace_admin(public.safe_uuid((storage.foldername(name))[1]))
      or exists (
        select 1
        from public.attachments a
        where a.bucket_id = 'attachments'
          and a.storage_path = storage.objects.name
          and a.page_id is not null
          and public.can_write_page(a.page_id)
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Orphan cleanup
-- -----------------------------------------------------------------------------
-- Deleting the metadata row removes the object, so a page cascade does not leave
-- bytes behind in the bucket.

create or replace function public.attachments_delete_object()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from storage.objects o
  where o.bucket_id = old.bucket_id and o.name = old.storage_path;
  return old;
end;
$$;

create trigger attachments_delete_object
  after delete on public.attachments
  for each row execute function public.attachments_delete_object();
