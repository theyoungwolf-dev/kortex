import { queryOptions } from "@tanstack/react-query";
import { PAGE_DETAIL_SELECT, TREE_PAGE_SELECT } from "@/lib/db/selects";
import { toActorRef, toPageNodeData } from "@/lib/db/map";
import { keys } from "@/lib/queries/keys";
import { publishState } from "@/lib/visibility";
import type { Db } from "@/lib/db/types";
import type { ChildPageRow, PageNodeData, PageViewData } from "@/lib/types";

/**
 * One level of the tree.
 *
 * The sidebar never fetches a whole tree - each level is its own query, enabled
 * only once its parent is expanded. That is a hard rule, not an optimisation:
 * a workspace's page tree is unbounded in depth.
 */
export async function listSiblings(db: Db, collectionId: string, parentId: string | null): Promise<PageNodeData[]> {
  const query = db
    .from("pages")
    .select(TREE_PAGE_SELECT)
    .eq("collection_id", collectionId)
    .is("deleted_at", null)
    .is("children.deleted_at", null)
    .order("rank", { ascending: true });

  const { data, error } = await scopeToParent(query, parentId);

  if (error) throw error;

  return (data ?? []).map(toPageNodeData);
}

export function siblingsOptions(db: Db, collectionId: string, parentId: string | null) {
  return queryOptions({
    queryKey: keys.siblings(collectionId, parentId),
    queryFn: () => listSiblings(db, collectionId, parentId),
  });
}

/* ---------------------------------------------------------------------------
   The page pane
   --------------------------------------------------------------------------- */

/**
 * One page, with everything the pane renders.
 *
 * `.maybeSingle()`, never `.single()`: under RLS a draft belonging to someone
 * else and a page that does not exist are the same empty result, and both
 * deserve a 404 rather than a thrown PGRST116 surfacing as an error boundary.
 */
export async function getPageView(db: Db, pageId: string, basePath: string): Promise<PageViewData | null> {
  const { data, error } = await db
    .from("pages")
    .select(PAGE_DETAIL_SELECT)
    .eq("id", pageId)
    .is("deleted_at", null)
    .is("children.deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // The breadcrumb walks `ancestor_ids`, which the tree trigger maintains in
  // root-first order - so no recursive query is needed to build the trail.
  const ancestors = await getAncestors(db, data.ancestor_ids);

  const node = toPageNodeData(data);

  return {
    ...node,
    author: toActorRef(data.author),
    lastEditedBy: data.editor ? toActorRef(data.editor) : toActorRef(data.author),
    lastEditedAt: data.last_edited_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    readerCount: data.views?.[0]?.count ?? 0,
    readers: (data.readers ?? []).flatMap((row) => (row.user ? [toActorRef(row.user)] : [])),
    breadcrumb: [
      ...(data.collection ? [{ id: data.collection.id, title: data.collection.name, href: `${basePath}/c/${data.collection.id}` }] : []),
      ...ancestors.map((ancestor) => ({
        id: ancestor.id,
        title: ancestor.title,
        href: `${basePath}/p/${ancestor.id}`,
        state: publishState(ancestor),
      })),
      { id: data.id, title: data.title, href: `${basePath}/p/${data.id}` },
    ],
    // The nearest ancestor that is not published is what holds this page in the
    // "Hidden" state - published itself, unreachable because of the chain above.
    blockingAncestor: node.publishedAt && !node.isPublishedTree ? findBlocker(ancestors) : undefined,
    isStarred: (data.stars ?? []).length > 0,
  };
}

async function getAncestors(db: Db, ancestorIds: string[]) {
  if (ancestorIds.length === 0) return [];

  const { data } = await db
    .from("pages")
    .select("id, title, published_at, is_published_tree")
    .in("id", ancestorIds)
    .is("deleted_at", null);

  const byId = new Map((data ?? []).map((row) => [row.id, row]));

  // `.in()` does not preserve order, but `ancestor_ids` is already root-first,
  // so re-index rather than sorting.
  return ancestorIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    return [{ id: row.id, title: row.title, publishedAt: row.published_at, isPublishedTree: row.is_published_tree }];
  });
}

function findBlocker(ancestors: { id: string; title: string; publishedAt: string | null }[]) {
  const blocker = ancestors.find((ancestor) => ancestor.publishedAt === null);
  return blocker ? { id: blocker.id, title: blocker.title } : undefined;
}

/**
 * Child pages as the pane's list renders them, with hrefs already built.
 *
 * Its own select rather than reusing `listSiblings`, because the list shows an
 * "updated" timestamp and `PageNodeData` deliberately does not carry one.
 */
export async function listChildRows(
  db: Db,
  collectionId: string,
  parentId: string | null,
  basePath: string,
): Promise<ChildPageRow[]> {
  const query = db
    .from("pages")
    .select("id, title, published_at, is_published_tree, updated_at")
    .eq("collection_id", collectionId)
    .is("deleted_at", null)
    .order("rank", { ascending: true });

  const { data, error } = await scopeToParent(query, parentId);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    href: `${basePath}/p/${row.id}`,
    publishedAt: row.published_at,
    isPublishedTree: row.is_published_tree,
    updatedAt: row.updated_at,
  }));
}

/**
 * Applies the parent filter.
 *
 * Exists so the null case is written once. PostgREST needs `.is('parent_id',
 * null)` and rejects `.eq('parent_id', null)`, while the query key uses
 * `parentId ?? 'root'` because null is not a usable key segment. Two
 * representations of the same concept, three characters apart - the reorder
 * handler will need this same helper.
 */
function scopeToParent<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
  query: T,
  parentId: string | null,
): T {
  return parentId === null ? query.is("parent_id", null) : query.eq("parent_id", parentId);
}
