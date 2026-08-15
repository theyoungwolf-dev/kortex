---
name: rank-audit
description: Audit Kortex lexorank ordering end to end - column collations, sibling unique indexes, the lib/rank wrapper, reorder handlers, collision retry, and cursor pagination. Use when drag-and-drop ordering misbehaves, items reshuffle after refresh, or before shipping changes to any reorder path.
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Bash(rg*)
---

Audit the ranking subsystem. Report findings; do not fix unless asked.

Ordering bugs here are almost never in the lexorank library. They are in the collation, the index, or the scope key. Check those first.

## 1. Collation

```
rg -n 'rank' supabase/migrations/ --glob '*.sql'
```

Every rank column must be `text collate "C"`. A locale-aware collation sorts by linguistic rules, not bytes, so Postgres and JavaScript will disagree about which of two ranks is smaller. Symptom: lists look correct after a drag, then reshuffle on refresh.

Also check that no query or view re-collates the column.

## 2. Sibling unique indexes

Three scopes must each be uniquely constrained:

| Table         | Scope                              |
| ------------- | ---------------------------------- |
| `collections` | `(workspace_id, private_to, rank)` |
| `pages`       | `(collection_id, parent_id, rank)` |
| `page_stars`  | `(user_id, rank)`                  |

For the first two, the scope column is nullable, so the index requires `NULLS NOT DISTINCT` or root-level rows are entirely unconstrained. `collections` and `pages` are soft-deletable and their indexes need `WHERE deleted_at IS NULL`; `page_stars` has no `deleted_at` and must not carry that predicate.

`NULLS NOT DISTINCT` is the property `supabase db diff` compares but cannot emit, so verify it against the database rather than by reading the migration:

```
docker exec supabase_db_kortex psql -U postgres -d postgres -c \
  "select indexrelid::regclass, indnullsnotdistinct from pg_index where indexrelid::regclass::text in ('collections_scope_rank_key','pages_sibling_rank_key');"
```

## 3. The `lib/rank` wrapper boundary

```
rg -n '@theyoungwolf/lexorank' --glob '!node_modules'
```

The only file that may import the package is `lib/rank/index.ts`. Any other importer is a finding: `@theyoungwolf/lexorank` is our own package, so its API can shift, and direct imports scatter the blast radius.

Then read `lib/rank/index.ts` against its four guarantees. These are easy to get subtly wrong and the failures are silent:

- `between(null, null)` returns the same as `first()`
- `between(prev, null)` returns a rank strictly greater than `prev`
- `between(null, next)` returns a rank strictly less than `next`
- `between(prev, next)` returns a value strictly between them

Test the last one specifically against **adjacent** ranks - the case where no value exists between two neighbours is where a naive midpoint implementation either throws or returns a duplicate. Duplicates surface later as a `23505`, which the retry masks, so the real bug hides behind a working-looking system.

Confirm every returned rank compares correctly under plain JavaScript `<`. That is the contract with `COLLATE "C"` on the Postgres side; if the package ever emits a character outside that assumption, ordering diverges between client and server.

Check that `entropy()` exists and returns a suffix that cannot itself reorder the item - appending it must move the rank strictly later than the colliding value but before the next sibling.

## 4. Reorder handlers

Read `app/api/*/reorder/route.ts`. Verify each:

- Builds its Supabase client from the caller's cookies. A service-role client here is a critical security finding, not a ranking one - flag it loudly.
- Resolves `prevRank` from `prevId`, then finds the next-adjacent sibling as the smallest rank strictly greater than `prevRank`, **scoped to the destination parent**. A common bug is scoping to the source parent on a cross-list move.
- Uses `.is('parent_id', null)` for root scope, not `.eq('parent_id', null)` - PostgREST needs `.is` for null.
- Early-exits when the item is already in the target slot, for both the `prevId` and the no-`prevId` branch.
- Handles Postgres `23505` by appending `entropy()` and retrying exactly once, then failing.
- Updates `rank` and `parent_id` in the same statement.
- Validates the body with Zod.

## 5. Creation path

New items **prepend**. Verify create computes `before(firstSiblingRank)`, or `first()` when the list is empty - not `after(lastRank)`.

## 6. Cursors

Rank is unique within scope, so the pagination cursor is the last rank string and the filter is `.gt('rank', cursor)`. Flag any reintroduced composite or base64 cursor as unnecessary complexity. Flag any keyset filter on a non-unique column (`title`, `updated_at`) that lacks an ID tiebreak - that one silently drops rows.

## 7. Client cache keys

TanStack Query sibling keys must match the rank uniqueness scope exactly: `['pages', collectionId, parentId ?? 'root']`. A key that omits `parentId` will make a reorder in one branch invalidate or corrupt another.

## Output

For each finding: file, line, what the user sees when it goes wrong, and the fix. Note explicitly which of the seven sections passed clean.
