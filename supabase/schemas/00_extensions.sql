-- Extensions.
--
-- `pgcrypto` supplies `gen_random_bytes()` for invitation tokens
-- (`create_workspace_invitation` in 04_workspaces.sql). Installed into
-- the `extensions` schema per Supabase convention; the database search_path
-- already includes it, so bare names resolve.

create extension if not exists pgcrypto with schema extensions;
