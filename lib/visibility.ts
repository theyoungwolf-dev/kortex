/**
 * Publish visibility, derived in exactly one place.
 *
 * The rule (ARCHITECTURE.md §6): a page is visible to anyone but its author
 * only if it *and every ancestor above it* has been published. A published
 * page under a draft parent is Hidden -- it exists, it is published, and
 * nobody but the author can reach it.
 *
 * `is_published_tree` is maintained by the `pages_tree_sync` trigger, so the
 * three states are a pure function of two columns. Never recompute this
 * inline in a component: the tree icon, the header chip and the child-page
 * list must always agree.
 */

export type PublishState = "draft" | "published" | "hidden";

export interface PublishStateInput {
  /** `pages.published_at`. Null means the page has never been published. */
  publishedAt: string | null;
  /** `pages.is_published_tree`. True only when every ancestor is published too. */
  isPublishedTree: boolean;
}

export function publishState(p: PublishStateInput): PublishState {
  if (!p.publishedAt) return "draft";
  return p.isPublishedTree ? "published" : "hidden";
}

/** True when the page is published but an ancestor still blocks it. */
export function isHidden(p: PublishStateInput): boolean {
  return publishState(p) === "hidden";
}

/**
 * The word the interface uses for each state. Published pages carry no label
 * in the tree or the child list -- the icon already says it, and the design
 * keeps the tree quiet -- so the caller decides whether to render this.
 */
export const publishStateLabel: Record<PublishState, string> = {
  draft: "Draft",
  published: "Published",
  hidden: "Hidden",
};
