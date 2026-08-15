# Kortex

Open-source, multi-tenant knowledge base. Collections contain a tree of pages; pages hold Tiptap JSON, are drag-reorderable, and are individually publishable.

Full design rationale lives in `docs/ARCHITECTURE.md`. Read it before any schema, ranking, or visibility work. This file is the short version plus the rules that are easy to break.

## Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase: Postgres, Auth, Storage, RLS
- Data access via `supabase-js` / PostgREST. **No ORM anywhere - not at runtime, not for schema authoring.**
- Schema is declarative SQL in `supabase/schemas/`; `supabase db diff -f <name>` generates `supabase/migrations/`. See `docs/ARCHITECTURE.md` §3.2 for why the ORM was removed
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
8. **No cycles.** A page may not be moved under its own descendant. The `BEFORE UPDATE` guard checks that `new.id` is **not** among the _target parent's_ `ancestor_ids` - not that `new.parent_id` is absent from `new.ancestor_ids`. In a `BEFORE` trigger `new.ancestor_ids` is still the old chain, so the latter misses real cycles and rejects legal reparenting onto a grandparent.

## Ranking

Three independent scopes, each with its own unique index:

| Scope                       | Table         | Uniqueness                         |
| --------------------------- | ------------- | ---------------------------------- |
| Collections within an owner | `collections` | `(workspace_id, private_to, rank)` |
| Pages within a parent       | `pages`       | `(collection_id, parent_id, rank)` |
| Starred pages within a user | `page_stars`  | `(user_id, rank)`                  |

`collections.private_to` is a nullable FK to `profiles` - null means the collection belongs to the workspace, non-null means it is personal to that user. There is no `owner_kind` enum and no `owner_member_id`; ownership is read off the nullability.

- Create **prepends**: new items appear at the top of their list.
- Reorder is expressed as `(itemId, newParentId, prevId | null)`. The server resolves `prevRank` and the next-adjacent sibling rank, then computes between them.
- On Postgres error `23505`, append `entropy()` to the rank and retry **once**. This is the collision strategy; do not replace it with a rebalance pass.
- Reorder logic lives in Route Handlers (`app/api/*/reorder/route.ts`), never in the browser and never in SQL.
- Because rank is unique within scope, **pagination cursors are just the last rank string**. Do not reintroduce composite/base64 cursors.

## Schema files

`supabase/schemas/*.sql` is the source of truth. The numeric prefixes are **execution order**, not decoration: the CLI globs the directory and applies the files in lexical order to a shadow database, so every file may only reference objects created by a lower-numbered file.

```
00_extensions  01_types  02_functions  03_identity  04_workspaces  05_collections
06_pages  07_page_stars  08_page_views  09_attachments  10_helpers  11_storage
12_policies  13_grants  14_triggers
```

What actually forces this order:

- **`language sql` bodies are validated at creation.** A SQL function that calls a function defined later fails immediately. `language plpgsql` bodies are _not_ validated, so they may reference anything - that is why `handle_new_user` can sit in `03_identity` and insert into `pages`.
- **Policies resolve their function references at creation.** `11_storage` and `12_policies` call the helpers, so `10_helpers` must precede both. This is why the auth helpers live in `10_helpers` and not in `02_functions`, even though they look like generic utilities.
- **`13_grants` uses `all tables in schema public`**, so it must come after every table.
- **Triggers referencing a column** (`before update of title, content`) fail if the column does not exist, so `14_triggers` is last.

If a rename or a new dependency shifts the order, renumber the files rather than adding a forward declaration.

**DDL goes in `supabase/schemas/`, DML goes in `supabase/seed.sql`.** The split is by statement kind, not by subject matter - storage is the case that trips people up:

| Thing                                               | Where                                                       | Why                                         |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| Storage **buckets** (`insert into storage.buckets`) | `seed.sql`                                                  | DML                                         |
| Storage **object policies**                         | `11_storage.sql`, **and** the migration's hand-written tail | DDL, but `db diff` will not carry it across |

Do not "fix" the storage blind spot by moving the policies into `seed.sql`. Seed runs on `db reset` but never on `db push`, so policies parked there would never reach a deployed database.

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
npm run db:diff <name>       # supabase/schemas/ -> a new migration
supabase db diff             # drift check; must print "No schema changes found"
npm run db:types             # supabase gen types typescript > lib/database.types.ts
```

After any migration, regenerate types (`npm run db:types`) and run `npm run typecheck`. A migration is not done until both pass.

**`supabase db diff` compares `supabase/schemas/` against `supabase/migrations/` - not against your running database.** Both sides are applied to throwaway shadow databases and the catalogs are compared. Changing the local database by hand therefore has no effect on the diff at all, and a clean diff says the two directories agree, _not_ that your local database matches them. Use `--local` to compare migrations against the live local database instead.

**It is not lossless.** Read every generated migration and re-add the following by hand under a marked tail section - `supabase/migrations/20260815164959_initial_schema.sql` has a `HAND-WRITTEN TAIL` showing the pattern:

| Dropped                                          | Behaviour                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NULLS NOT DISTINCT`                             | The engine _compares_ the property but cannot _emit_ it. A lost clause shows up as a proposed `DROP INDEX` + `CREATE UNIQUE INDEX` of a sibling-rank index - regenerating produces the same defective DDL, so hand-editing is the only fix. |
| Everything in the `storage` schema               | Invisible in both directions, including with `-s storage`. Storage policies you author are never emitted, never diffed, and never reported as drift.                                                                                        |
| `REVOKE`s against `anon`, and default privileges | Emitted only as `REVOKE ... FROM PUBLIC`; the `anon` grants are treated as a no-op.                                                                                                                                                         |
| All DML                                          | A schema differ has no notion of rows. DML belongs in `supabase/seed.sql`.                                                                                                                                                                  |

A trigger you attach to `auth.users` **does** round-trip - `on_auth_user_created` is emitted and drift on it is detected - so the auth schema is not a blind spot the way storage is.

**Because storage is invisible, the drift check cannot cover it.** After changing `11_storage.sql`, verify against the database directly:

```bash
docker exec supabase_db_kortex psql -U postgres -d postgres -c \
  "select policyname, cmd from pg_policies where schemaname = 'storage' order by policyname;"
```

The drift check itself needs no reset, since the live database is not a side of the comparison. Run `supabase db reset` anyway to prove the migration applies cleanly and the seed still loads, then `supabase db diff`: a clean tree prints "No schema changes found".

## Working style

- Read `docs/ARCHITECTURE.md` before proposing schema or authorization changes.
- Prefer plain PostgREST calls. Add an RPC only when a single transaction is genuinely required, and say why in the migration comment.
- When touching RLS, state which policy changed and what a non-member, a member, and an author can each now see.
- Reference files from the previous Go/Mantine implementation may appear in conversation. They are context for _intent_ only - do not port their patterns (GORM scopes, Relay cursors, Apollo cache surgery, River jobs) into this codebase.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` - verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
