import { queryOptions } from "@tanstack/react-query";
import { COLLECTION_DETAIL_SELECT, TREE_COLLECTION_SELECT } from "@/lib/db/selects";
import { toCollectionNodeData } from "@/lib/db/map";
import { keys } from "@/lib/queries/keys";
import { listChildRows } from "@/lib/queries/pages";
import type { Db, OwnerKind } from "@/lib/db/types";
import type { CollectionNodeData, CollectionViewData } from "@/lib/types";

/**
 * The two sidebar collection lists.
 *
 * `ownerKind` is not a column - it is the nullability of `private_to`. RLS
 * already hides other people's personal collections, so the filter here is about
 * which *section* a row belongs to, not about access.
 */
export async function listCollections(
  db: Db,
  workspaceId: string,
  ownerKind: OwnerKind,
): Promise<CollectionNodeData[]> {
  const base = db
    .from("collections")
    .select(TREE_COLLECTION_SELECT)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    // The embedded count is of root pages only - that is what decides whether
    // the collection gets a chevron.
    .is("pages.parent_id", null)
    .is("pages.deleted_at", null)
    .order("rank", { ascending: true });

  const { data, error } =
    ownerKind === "workspace" ? await base.is("private_to", null) : await base.not("private_to", "is", null);

  if (error) throw error;

  return (data ?? []).map(toCollectionNodeData);
}

/**
 * Shared by the server prefetch and the client hook.
 *
 * Both sides build their options from this one factory, passing their own `db`.
 * That is what guarantees the key and the row shape match across the boundary -
 * a mismatch is silent, and shows up only as the hydrated value being ignored
 * and the client refetching.
 */
export function collectionsOptions(db: Db, workspaceId: string, ownerKind: OwnerKind) {
  return queryOptions({
    queryKey: keys.collections(workspaceId, ownerKind),
    queryFn: () => listCollections(db, workspaceId, ownerKind),
  });
}

/* ---------------------------------------------------------------------------
   The collection pane
   --------------------------------------------------------------------------- */

export async function getCollectionView(
  db: Db,
  collectionId: string,
  basePath: string,
): Promise<CollectionViewData | null> {
  const { data, error } = await db
    .from("collections")
    .select(COLLECTION_DETAIL_SELECT)
    .eq("id", collectionId)
    .is("deleted_at", null)
    .is("pages.parent_id", null)
    .is("pages.deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const children = await listChildRows(db, data.id, null, basePath);

  return {
    ...toCollectionNodeData(data),
    children,
    pageCount: data.pages?.[0]?.count ?? 0,
    updatedAt: data.updated_at,
  };
}

