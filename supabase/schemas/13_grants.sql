-- -----------------------------------------------------------------------------
-- Role grants
-- -----------------------------------------------------------------------------
-- Nothing in Kortex is world-readable, so anon loses table access entirely.
-- If public page sharing is added later it should arrive as an explicit
-- anon SELECT policy on a `share_links` join, not by widening this.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon;
