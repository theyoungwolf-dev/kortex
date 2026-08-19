/**
 * Workspace slug derivation, mirroring `public.generate_workspace_slug`
 * (supabase/schemas/04_workspaces.sql).
 *
 * This exists only so the onboarding form can show a live preview as the user
 * types. The database remains authoritative: it re-derives the slug and appends
 * an entropy suffix on collision, so the value returned by `rename_workspace`
 * can legitimately differ from what was previewed. Always navigate to the slug
 * the RPC returns, never to the one shown here.
 *
 * Keep the two in step - the rules are duplicated deliberately, not shared.
 */
export function workspaceSlug(name: string): string {
  let slug = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  if (slug.length < 3) slug = "workspace";

  return slug;
}
