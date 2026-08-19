import type { Tables } from "@/lib/database.types";
import type { ActorRef, AvatarTone, CollectionNodeData, PageNodeData, TreeItem, WorkspaceRef } from "@/lib/types";
import type { OwnerKind } from "@/lib/db/types";

/**
 * Row -> prop-shape mappers. The only place a PostgREST row is allowed to
 * become something a component sees.
 *
 * Two rules hold this layer together:
 *
 *  - **Everything out of here is plain JSON with ISO strings.** TanStack Query's
 *    structural sharing is what keeps a refetch from re-rendering the whole
 *    tree, and it silently stops working the moment a `Date`, `Map`, or class
 *    instance crosses the boundary.
 *  - **No raw row escapes.** Components depend on `lib/types.ts`, not on
 *    `Tables<>`, so a column rename lands here rather than in 40 components.
 */

/** Postgres shape of an embedded `(count)` aggregate. */
type EmbeddedCount = { count: number }[] | null;

function hasAny(count: EmbeddedCount): boolean {
  return (count?.[0]?.count ?? 0) > 0;
}

/**
 * Avatar grounds alternate rather than being stored. Derived from the id so a
 * given person keeps the same tone everywhere, across reloads and machines.
 */
function toneFor(id: string): AvatarTone {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return sum % 2 === 0 ? "cool" : "warm";
}

function initialsFrom(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Every mapper's input is a `Pick` of the generated row type rather than an
 * inline structural shape. That is what makes a column rename a compile error
 * in this file instead of a runtime `undefined` in a component.
 */
export function toActorRef(
  row: Pick<Tables<"profiles">, "id" | "username" | "display_name" | "full_name"> &
    Partial<Pick<Tables<"profiles">, "avatar_path">>,
): ActorRef {
  // `display_name` is optional and `username` is NOT NULL, so username is the
  // reliable fallback - never the email, which RLS does not expose anyway.
  const displayName = row.display_name ?? row.full_name ?? row.username;

  return {
    id: row.id,
    displayName,
    initials: initialsFrom(row.full_name ?? displayName),
    tone: toneFor(row.id),
    avatarPath: row.avatar_path ?? null,
  };
}

export function toWorkspaceRef(row: Pick<Tables<"workspaces">, "id" | "name" | "slug">): WorkspaceRef {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    initials: initialsFrom(row.name),
  };
}

/** `private_to` is the ownership discriminator - there is no `owner_kind` column. */
export function ownerKindOf(privateTo: string | null): OwnerKind {
  return privateTo === null ? "workspace" : "personal";
}

export function toCollectionNodeData(
  row: Pick<Tables<"collections">, "id" | "name" | "description" | "icon" | "rank" | "workspace_id" | "private_to"> & {
    pages?: EmbeddedCount;
  },
): CollectionNodeData {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    description: row.description,
    workspaceId: row.workspace_id,
    ownerKind: ownerKindOf(row.private_to),
    rank: row.rank,
    hasChildren: hasAny(row.pages ?? null),
  };
}

export function toPageNodeData(
  row: Pick<
    Tables<"pages">,
    "id" | "title" | "parent_id" | "collection_id" | "rank" | "published_at" | "is_published_tree"
  > & { children?: EmbeddedCount },
): PageNodeData {
  return {
    id: row.id,
    title: row.title,
    parentId: row.parent_id,
    collectionId: row.collection_id,
    rank: row.rank,
    publishedAt: row.published_at,
    isPublishedTree: row.is_published_tree,
    hasChildren: hasAny(row.children ?? null),
  };
}

/**
 * Wraps a node as a sidebar row.
 *
 * `depth` here is **visual** depth, which is one greater than `pages.depth`
 * because a collection occupies level 0 of the sidebar. The two are not
 * interchangeable and must never be renamed into each other.
 */
export function toCollectionTreeItem(collection: CollectionNodeData): TreeItem {
  return { kind: "collection", depth: 0, ...collection };
}

export function toPageTreeItem(page: PageNodeData, visualDepth: number): TreeItem {
  return { kind: "page", depth: visualDepth, ...page };
}
