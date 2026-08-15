-- Seed data.
--
-- Everything here is DML, which `supabase db diff` does not capture. Anything
-- that must exist for the app to work but is not DDL belongs in this file, so
-- that `supabase db reset` on a clean checkout still yields a working
-- instance (ARCHITECTURE §12: "every piece of state must be reproducible from
-- supabase/migrations/ plus supabase/seed.sql").

-- =============================================================================
-- Storage buckets and object policies
-- =============================================================================
-- Path conventions are load-bearing: the policies below authorize by reading the
-- first folder segment, so uploads must follow them exactly.
--
--   avatars/         <user_id>/<filename>
--   workspace-logos/ <workspace_id>/<filename>
--   attachments/     <workspace_id>/<page_id>/<uuid>-<filename>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880,
   array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('workspace-logos', 'workspace-logos', true, 5242880,
   array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('attachments', 'attachments', false, 52428800, null)
on conflict (id) do nothing;
