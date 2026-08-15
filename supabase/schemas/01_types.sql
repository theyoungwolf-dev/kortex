create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');

comment on type public.workspace_role is
  'owner: billing + destroy workspace. admin: manage members/settings. member: full content access. guest: read-only.';
