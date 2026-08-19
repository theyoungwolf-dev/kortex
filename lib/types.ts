/**
 * Prop contracts for the presentational component layer.
 *
 * Shapes mirror the rows in ARCHITECTURE.md §4 plus the state derived from
 * them, so wiring these components to PostgREST later is a mapping exercise
 * rather than a redesign. Nothing here imports Supabase; these are the shapes
 * components accept, not the shapes the database returns.
 *
 * Timestamps are ISO strings, not Date objects, so every one of these can
 * cross the server/client boundary as a serialisable prop.
 */

import type { Enums, Tables } from "@/lib/database.types";

import type { PublishStateInput } from "@/lib/visibility";

/* ---------------------------------------------------------------------------
   Actors
   ---------------------------------------------------------------------------
   Backed by `public.profiles`, which is the readable mirror of `auth.users`
   (RLS never exposes auth.users to a client). `initials` and `tone` are derived
   in `lib/db/map.ts`, not stored.
   --------------------------------------------------------------------------- */

/** The two avatar grounds the design rotates between. */
export type AvatarTone = "cool" | "warm";

export interface ActorRef {
  id: string;
  /** `profiles.display_name ?? full_name ?? username`. Never the email. */
  displayName: string;
  /** One or two characters. Precomputed so components never slice names. */
  initials: string;
  tone: AvatarTone;
  /** Object path in the `avatars` bucket. Resolve to a URL at render time. */
  avatarPath?: string | null;
  /**
   * Only ever populated for the **signed-in user**, and sourced from
   * `auth.getUser()` rather than from `profiles`. RLS does not expose other
   * people's email addresses, so treat this as absent for anyone else.
   */
  email?: string;
}

/* ---------------------------------------------------------------------------
   Collections and pages
   --------------------------------------------------------------------------- */

/**
 * Derived from `collections.private_to`, never stored: null means the
 * collection belongs to the workspace, non-null means it is personal to that
 * profile. There is no `owner_kind` column.
 */
export type OwnerKind = "personal" | "workspace";

/** A row of `collections`, plus the state the sidebar derives. */
export interface CollectionNodeData extends Pick<
  Tables<"collections">,
  "id" | "name" | "icon" | "description" | "rank"
> {
  workspaceId: string;
  ownerKind: OwnerKind;
  hasChildren: boolean;
}

/**
 * A row of `pages`, plus the tree state the trigger maintains.
 *
 * Deliberately carries no `depth`. The database has `pages.depth` (0 for a root
 * page) and the sidebar has a *visual* depth one greater, because a collection
 * occupies level 0. Holding both under one name is how they get conflated, so
 * visual depth lives on `TreeItem` alone and this shape has neither.
 */
export interface PageNodeData extends PublishStateInput, Pick<Tables<"pages">, "id" | "title" | "rank"> {
  parentId: string | null;
  collectionId: string;
  hasChildren: boolean;
}

/**
 * One entry in the sidebar tree, flattened.
 *
 * The tree arrives as a flat, ordered array rather than a nested structure:
 * it is what a `(collection_id, parent_id, rank)` query returns, it keeps the
 * client component's drag logic working on indices, and it serialises across
 * the server/client boundary without a recursive type.
 *
 * `depth` here is *visual* depth, which is one greater than `pages.depth`
 * because a collection occupies level 0 of the sidebar. Levels beyond 5 hold
 * at level 5's type and keep indenting.
 */
export type TreeItem =
  | ({ kind: "collection"; depth: 0 } & CollectionNodeData)
  | ({ kind: "page"; depth: number } & PageNodeData);

export interface SidebarSection {
  id: string;
  /** "Favourites", "My Collections", "Workspace Collections". */
  label: string;
  items: TreeItem[];
  /** Favourites renders a dashed prompt rather than a tree when empty. */
  emptyPrompt?: { title: string; body: string };
  /** Only the collection sections carry an add affordance. */
  canAdd?: boolean;
}

/* ---------------------------------------------------------------------------
   Page and collection views
   --------------------------------------------------------------------------- */

export interface BreadcrumbItem {
  id: string;
  title: string;
  href: string;
  /**
   * Ancestors render their own publish state so the blocking draft in a
   * Hidden chain is visible in the trail, as in App shell 1b.
   */
  state?: import("@/lib/visibility").PublishState;
}

export interface PageViewData extends PageNodeData {
  author: ActorRef;
  lastEditedBy: ActorRef;
  lastEditedAt: string;
  createdAt: string;
  updatedAt: string;
  /** `page_views` aggregated: total distinct readers, plus a few to show. */
  readerCount: number;
  readers: ActorRef[];
  breadcrumb: BreadcrumbItem[];
  /**
   * The nearest unpublished ancestor. Present only when the page is Hidden;
   * it is what the banner names and offers to publish.
   */
  blockingAncestor?: { id: string; title: string };
  isStarred: boolean;
}

export interface ChildPageRow extends PublishStateInput {
  id: string;
  title: string;
  href: string;
  updatedAt: string;
}

export interface CollectionViewData extends CollectionNodeData {
  children: ChildPageRow[];
  pageCount: number;
  updatedAt: string;
}

/* ---------------------------------------------------------------------------
   Editor
   --------------------------------------------------------------------------- */

/** The four states of the autosave indicator (Page + Editor, 2c). */
export type SaveStatus = "idle" | "saving" | "saved" | "conflict";

/* ---------------------------------------------------------------------------
   Workspace
   --------------------------------------------------------------------------- */

/**
 * The database enum, not a hand-written copy.
 */
export type MemberRole = Enums<"workspace_role">;

export interface WorkspaceRef extends Pick<Tables<"workspaces">, "id" | "name" | "slug"> {
  /** Initials shown in the sidebar's workspace chip. Derived, not stored. */
  initials: string;
}

/**
 * A seat in `workspace_members`. Always has a profile behind it.
 *
 * Kept separate from `PendingInvitation` on purpose. An invitation has an
 * email address and no profile row at all until it is accepted.
 */
export interface MemberRow {
  id: string;
  actor: ActorRef;
  role: MemberRole;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: MemberRole;
  invitedAt: string;
  expiresAt: string;
}
