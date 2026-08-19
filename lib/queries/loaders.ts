import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug, getActor } from "@/lib/queries/workspace";
import { getCollectionView } from "@/lib/queries/collections";
import { getPageView } from "@/lib/queries/pages";
import { listInvitations, listMembers } from "@/lib/queries/members";

/**
 * Server-side loaders: the same queries, memoised per request.
 *
 * Kept in their own module because everything in `lib/queries/` is deliberately
 * **isomorphic** - each function takes a `Db` so the identical code runs in a
 * server prefetch and in a browser hook. The moment one of those modules
 * imports `lib/supabase/server`, a client component importing *anything* from
 * it drags `next/headers` into the browser bundle. That was a real failure
 * here: `sidebar-tree-container.tsx` imports `siblingsOptions` from
 * `lib/queries/pages.ts`, and a `cache()`d loader living in that same file
 * broke the whole route with a bundler error rather than a type error.
 * `server-only` at the top of this file and of `lib/supabase/server.ts` turns
 * any repeat of that into a build error naming the file.
 *
 * React `cache()` scopes each memo to one request with no sharing between
 * requests - the property RLS requires. The layout, the route pane and
 * `generateMetadata` can each ask for the workspace and get one query.
 */

export const loadWorkspace = cache(async (slug: string) => {
  const db = await createClient();
  return getWorkspaceBySlug(db, slug);
});

export const loadActor = cache(async () => {
  const db = await createClient();
  return getActor(db);
});

export const loadPageView = cache(async (pageId: string, basePath: string) => {
  const db = await createClient();
  return getPageView(db, pageId, basePath);
});

export const loadCollectionView = cache(async (collectionId: string, basePath: string) => {
  const db = await createClient();
  return getCollectionView(db, collectionId, basePath);
});

export const loadMembers = cache(async (workspaceId: string) => {
  const db = await createClient();
  return Promise.all([listMembers(db, workspaceId), listInvitations(db, workspaceId)]);
});
