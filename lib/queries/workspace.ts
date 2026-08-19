import { PROFILE_SELECT, WORKSPACE_SELECT } from "@/lib/db/selects";
import { toActorRef, toWorkspaceRef } from "@/lib/db/map";
import type { Db } from "@/lib/db/types";
import type { ActorRef, WorkspaceRef } from "@/lib/types";

/**
 * Workspace and actor reads.
 *
 * These are Server-Component-only and deliberately not TanStack queries: nothing
 * a client interaction touches invalidates them, so paying for a client cache
 * entry and a hydration round-trip would buy nothing.
 *
 * `.maybeSingle()` everywhere, never `.single()`. Under RLS a row you may not
 * see is indistinguishable from one that does not exist - both come back empty -
 * and `.single()` turns that into a thrown PGRST116 that surfaces as an error
 * boundary instead of a 404.
 */

export async function getWorkspaceBySlug(db: Db, slug: string): Promise<WorkspaceRef | null> {
  const { data } = await db
    .from("workspaces")
    .select(WORKSPACE_SELECT)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  return data ? toWorkspaceRef(data) : null;
}

export async function getActor(db: Db): Promise<ActorRef | null> {
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) return null;

  const { data } = await db.from("profiles").select(PROFILE_SELECT).eq("id", user.id).maybeSingle();

  return data ? toActorRef(data) : null;
}

