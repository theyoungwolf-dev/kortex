import { queryOptions } from "@tanstack/react-query";
import { STARRED_SELECT } from "@/lib/db/selects";
import { toPageNodeData } from "@/lib/db/map";
import { keys } from "@/lib/queries/keys";
import type { Db } from "@/lib/db/types";
import type { PageNodeData } from "@/lib/types";

/**
 * The Favourites section.
 *
 * Ordered by `page_stars.rank`, not by anything on the page - each user keeps
 * their own ordering, which is the third rank scope (`page_stars (user_id,
 * rank)`). Note this is the one rank scope with no `deleted_at`: unstarring is
 * a real delete.
 *
 * `!inner` on the embed so a star whose page RLS hides drops out entirely rather
 * than coming back as a row with a null page.
 */
export async function listStarred(db: Db, userId: string): Promise<PageNodeData[]> {
  const { data, error } = await db
    .from("page_stars")
    .select(STARRED_SELECT)
    .eq("user_id", userId)
    .is("page.deleted_at", null)
    .order("rank", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row): row is typeof row & { page: NonNullable<typeof row.page> } => row.page !== null)
    // A starred page is shown as a flat list, so it carries no children of its
    // own here - hence `hasChildren: false` rather than an extra count query.
    .map((row) => toPageNodeData({ ...row.page, rank: row.rank, children: null }));
}

export function starredOptions(db: Db, userId: string) {
  return queryOptions({
    queryKey: keys.starred(userId),
    queryFn: () => listStarred(db, userId),
  });
}
