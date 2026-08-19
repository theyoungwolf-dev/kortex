/**
 * The canonical PostgREST select strings.
 *
 * These live in one file because a select string is half of a contract: the
 * server prefetch and the client hook must request the *same* columns or the
 * hydrated cache entry disagrees with what the hook expects. Keeping them here
 * means a widened select is a one-line change that both sides pick up.
 *
 * ## The `hasChildren` embed
 *
 * There is no `has_children` column, and the sidebar needs one for the chevron.
 * PostgREST's embedded aggregate supplies it, but the syntax is unforgiving and
 * gets no help from the type system - a wrong hint is a runtime PGRST200, not a
 * compile error. Two things were established against the running database:
 *
 *   1. A self-referential embed must be hinted with the **column**
 *      (`pages!parent_id`). The constraint-name hint (`pages!pages_parent_id_fkey`)
 *      fails with "no matches were found", even though that constraint exists
 *      and is spelled correctly.
 *   2. The count honours RLS and any filter applied to the embed alias, so
 *      `children.deleted_at=is.null` correctly excludes trashed children, and a
 *      draft child of another user is not counted for someone who cannot see it.
 */

/** A sibling row in the tree. `children` collapses to `hasChildren` in the mapper. */
export const TREE_PAGE_SELECT = "id, title, parent_id, collection_id, rank, published_at, is_published_tree, updated_at, children:pages!parent_id(count)";

/** A collection in the sidebar. The embedded count is of its *root* pages only. */
export const TREE_COLLECTION_SELECT = "id, name, description, icon, rank, workspace_id, private_to, updated_at, pages(count)";

/** The workspace chip and breadcrumb root. */
export const WORKSPACE_SELECT = "id, name, slug, icon, is_personal";

/** The signed-in user, for the account menu and byline. */
export const PROFILE_SELECT = "id, username, display_name, full_name, avatar_path";

/**
 * A page pane.
 *
 * `pages` has three foreign keys into `profiles` (`created_by`,
 * `last_edited_by`, `collection_private_to`), so the author and editor embeds
 * *must* be disambiguated by constraint name. Unlike the self-referential case
 * above, constraint-name hints are the right form here and were verified
 * against the running database.
 *
 * `stars` comes back as an array that RLS has already reduced to the caller's
 * own row - `page_stars_select` is `user_id = auth.uid()` - so a non-empty array
 * means "I starred this", with no user filter needed in the query.
 */
export const PAGE_DETAIL_SELECT = `
  id, title, content, parent_id, collection_id, rank, published_at, is_published_tree,
  ancestor_ids, created_at, updated_at, last_edited_at,
  author:profiles!pages_created_by_fkey(id, username, display_name, full_name, avatar_path),
  editor:profiles!pages_last_edited_by_fkey(id, username, display_name, full_name, avatar_path),
  collection:collections(id, name),
  views:page_views(count),
  readers:page_views(user:profiles(id, username, display_name, full_name, avatar_path)),
  stars:page_stars(user_id),
  children:pages!parent_id(count)
`;

/** A collection pane. */
export const COLLECTION_DETAIL_SELECT = `
  id, name, description, icon, rank, workspace_id, private_to, updated_at,
  pages(count)
`;

/** A starred page in the Favourites section. */
export const STARRED_SELECT = "rank, page:pages!inner(id, title, parent_id, collection_id, published_at, is_published_tree, updated_at)";
