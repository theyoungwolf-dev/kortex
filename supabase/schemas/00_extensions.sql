-- Extensions.
--
-- `citext` backs workspaces.slug so lookups are case-insensitive without
-- lower() wrappers at every call site. Installed into the `extensions`
-- schema per Supabase convention - the database search_path already
-- includes it, so the bare type name `citext` resolves.
--
-- `pgcrypto` 

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
