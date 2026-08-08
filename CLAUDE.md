# Kortex

Open-source, multi-tenant knowledge base. Collections contain a tree of pages; pages hold Tiptap JSON, are drag-reorderable, and are individually publishable.

Full design rationale lives in `docs/ARCHITECTURE.md`. Read it before any schema, ranking, or visibility work. This file is the short version plus the rules that are easy to break.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase: Postgres, Auth, Storage, RLS
- Data access via `supabase-js` / PostgREST. **No ORM at runtime.**
- Drizzle (`drizzle/schema.ts`) is a schema-authoring tool only - it generates SQL into `supabase/migrations/`
- TanStack Query for client cache; `@dnd-kit` for drag-and-drop; Tiptap for the editor
- Lexorank via the npm library called `@theyoungwolf/lexorank`, wrapped behind `lib/rank/`

## Non-negotiable invariants

Breaking any of these produces bugs that look random and cost hours. Treat them as compile errors.

1. **`rank` columns are `text collate "C"`.** Locale-aware collation does not sort bytewise and will disagree with the JS lexorank comparison. Never declare a rank column without the collation. Never `ORDER BY` a rank through a different collation.
2. **Sibling-rank unique indexes use `NULLS NOT DISTINCT`.** Without it, `parent_id IS NULL` rows are unconstrained and root pages silently collide. Always paired with `WHERE deleted_at IS NULL`.
3. **The `pages_tree_sync` trigger fires only on `UPDATE OF parent_id, published_at`.** `pages_recompute_subtree` writes `ancestor_ids`, `depth`, and `is_published_tree`. Widening the trigger to all updates creates infinite recursion. Do not widen it.
4. **RLS is the only authorization layer.** Never use `SUPABASE_SERVICE_ROLE_KEY` in a Route Handler that serves a user request. Route Handlers build a client from the caller's cookies/JWT so policies still apply. Service role is for migrations and admin scripts only.
5. **Visibility rule:** a page is readable by a non-author only when `is_published_tree` is true - meaning it _and every ancestor_ is published. Author always sees their own drafts. This is expressed in the `pages_select` policy, not in application code.
6. **Wrap `auth.uid()` and helper functions in `(select ...)` inside policies** so Postgres hoists them to an InitPlan. Without this, policies evaluate per row.
7. **Soft delete.** Delete is `UPDATE ... SET deleted_at = now()`. Every policy `USING` clause and every unique index carries `deleted_at IS NULL`.
8. **No cycles.** A page may not be moved under its own descendant. The `BEFORE UPDATE` guard checks `new.parent_id <> ALL(new.ancestor_ids)`.

## Ranking

Three independent scopes, each with its own unique index:

| Scope                       | Uniqueness                              |
| --------------------------- | --------------------------------------- |
| Collections within an owner | `(workspace_id, owner_member_id, rank)` |
| Pages within a parent       | `(collection_id, parent_id, rank)`      |
| Starred pages within a user | `(user_id, rank)`                       |

- Create **prepends**: new items appear at the top of their list.
- Reorder is expressed as `(itemId, newParentId, prevId | null)`. The server resolves `prevRank` and the next-adjacent sibling rank, then computes between them.
- On Postgres error `23505`, append `entropy()` to the rank and retry **once**. This is the collision strategy; do not replace it with a rebalance pass.
- Reorder logic lives in Route Handlers (`app/api/*/reorder/route.ts`), never in the browser and never in SQL.
- Because rank is unique within scope, **pagination cursors are just the last rank string**. Do not reintroduce composite/base64 cursors.

## Conventions

- Server Components fetch; Client Components own interaction. The sidebar tree is a Client Component; page/collection panes are Server Components.
- TanStack Query keys: `['pages', collectionId, parentId ?? 'root']`, `['page', id]`, `['collections', workspaceId, ownerKind]`, `['starred', userId]`. The sibling key must match the rank uniqueness scope exactly.
- Optimistic mutations follow `onMutate` (cancel, snapshot, patch) → `onError` (restore) → `onSettled` (invalidate).
- Tree children load lazily - `enabled: isExpanded`. Never eagerly fetch a whole tree.
- Autosave debounces: title 500 ms, content 700 ms. Patches carry `updated_at` for optimistic-concurrency; zero rows updated means a conflict, so refetch and warn.
- Images store a Storage **path** in the Tiptap node attrs, never a URL. Signed URLs are resolved server-side at read time and stripped before save.
- All user-facing strings go through `next-intl`. No hardcoded copy in components.
- Validate every Route Handler body with a Zod schema before touching the database.

## Commands

```bash
npm run dev                  # Next dev server
npm run build                # production build
npm run lint                 # eslint
npm run typecheck            # tsc --noEmit
npm run test                 # vitest

supabase start               # local stack
supabase db reset            # rebuild local DB from migrations + seed
npm run db:generate          # drizzle-kit generate -> supabase/migrations/
npm run db:types             # supabase gen types typescript > lib/database.types.ts
```

After any migration, regenerate types (`npm run db:types`) and run `npm run typecheck`. A migration is not done until both pass.

## Working style

- Read `docs/ARCHITECTURE.md` before proposing schema or authorization changes.
- Prefer plain PostgREST calls. Add an RPC only when a single transaction is genuinely required, and say why in the migration comment.
- When touching RLS, state which policy changed and what a non-member, a member, and an author can each now see.
- Reference files from the previous Go/Mantine implementation may appear in conversation. They are context for _intent_ only - do not port their patterns (GORM scopes, Relay cursors, Apollo cache surgery, River jobs) into this codebase.
