import type { OwnerKind } from "@/lib/db/types";

/**
 * The only file allowed to construct a TanStack Query key.
 *
 * This matters more here than in a typical app, because TanStack's cache is a
 * **document cache, not a normalized one**: there is no entity identity, so a
 * key *is* the identity. Two call sites that spell the same logical query
 * differently get two independent copies of the same rows, and writing one does
 * not update the other.
 *
 * Two rules follow, and both are load-bearing:
 *
 *  1. **Keys are hierarchical**, so prefix invalidation works.
 *     `invalidateQueries({ queryKey: ['pages', collectionId] })` reaches every
 *     parent bucket in that collection in one call.
 *  2. **`siblings` must match the rank uniqueness scope exactly** -
 *     `pages_sibling_rank_key (collection_id, parent_id, rank)`. A key that
 *     omits `parentId` lets an optimistic reorder in one branch corrupt
 *     another's state, because both would be writing the same cache entry.
 *
 * Note `parentId ?? 'root'` here versus `.is('parent_id', null)` in the query:
 * null is not a usable key segment, but it *is* how PostgREST filters. The two
 * representations are three characters apart and mean the same thing.
 */
export const keys = {
  workspace: (slug: string) => ["workspace", slug] as const,
  actor: () => ["actor"] as const,

  collections: (workspaceId: string, ownerKind: OwnerKind) => ["collections", workspaceId, ownerKind] as const,

  /** Matches `pages_sibling_rank_key (collection_id, parent_id, rank)`. */
  siblings: (collectionId: string, parentId: string | null) =>
    ["pages", collectionId, parentId ?? "root"] as const,

  page: (id: string) => ["page", id] as const,

  starred: (userId: string) => ["starred", userId] as const,
} as const;
