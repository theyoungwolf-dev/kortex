---
name: migration
description: Create a new Kortex database migration. Use when the user asks to add or change a table, column, index, trigger, RLS policy, or SQL function, or says "new migration".
argument-hint: What the migration should do
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npx supabase db diff*), Bash(npx supabase migration new*), Bash(npx supabase migration list*), Bash(npm run db:types), Bash(npm run typecheck)
---

Create a migration for: $ARGUMENTS

Delegate the SQL authoring to the `migration-author` subagent - it holds the schema invariants. Then verify the result yourself.

## Steps

1. **Orient.** Read `supabase/schemas/` - the declarative SQL there is the source of truth for current state. List `supabase/migrations/` and read the most recent file to see what has already shipped.

2. **Delegate.** Hand the requirement to `migration-author`. Give it the relevant existing DDL as context.

3. **Edit the schema, then generate.** Change the relevant file(s) in `supabase/schemas/` - that is where the change is authored. Lead each new object with a comment: what it is, why, which `CLAUDE.md` invariant it touches.

   **Put it in the right file.** The `NN_` prefixes are execution order, and the whole directory is applied to a shadow database in lexical order. A `language sql` function body, a policy, or a trigger's `UPDATE OF` column list is resolved at creation time, so it can only reference objects from a lower-numbered file. `language plpgsql` bodies are the exception - they resolve at call time and may reference anything. If the change does not fit the existing order, renumber files rather than adding a forward declaration.

   ```bash
   npx supabase db diff -f <snake_case_name>
   ```

   A failure here reads `failed to provision the shadow database` with the offending statement quoted - that is almost always an ordering problem, not a syntax one.

4. **Verify against the invariants** before declaring done:
   - [ ] Any rank column is `text collate "C"`
   - [ ] Any unique index over a nullable scope column has `NULLS NOT DISTINCT`
   - [ ] Any unique index on a soft-deletable table has `WHERE deleted_at IS NULL`
   - [ ] New tables have `enable row level security` plus explicit policies
   - [ ] Policies include `deleted_at IS NULL` and wrap `auth.uid()` in `(select ...)`
   - [ ] `INSERT` policies have a `WITH CHECK`
   - [ ] `UPDATE` policies have both `USING` and `WITH CHECK`, and the `WITH CHECK` omits `deleted_at IS NULL` so soft delete still works
   - [ ] No change widens the `pages_tree_sync` trigger's `UPDATE OF` column list
   - [ ] Self-referencing parent changes are cycle-guarded

5. **Correct the generated migration.** `supabase db diff` is not lossless. Re-add by hand, under a clearly marked tail section:
   - `NULLS NOT DISTINCT` on any sibling-rank index - **always dropped**
   - anything in the `storage` schema - not covered by the diff at all
   - `REVOKE`s against `anon`, and anything else derived from default privileges
   - any DML (that belongs in `supabase/seed.sql`)

   The `HAND-WRITTEN TAIL` in `supabase/migrations/20260815164959_initial_schema.sql` shows the pattern.

6. **Regenerate and check.**

   ```bash
   npm run db:types
   npm run typecheck
   ```

7. **Drift check.** `npx supabase db diff` must print "No schema changes found". It compares `supabase/schemas/` against `supabase/migrations/` - **both on shadow databases, never the live one** - so you can run it yourself immediately and it needs no reset. If it wants to drop and recreate a sibling-rank index, `NULLS NOT DISTINCT` was lost in step 5; re-adding it by hand is the only fix, since regenerating emits the same defective DDL.

   The check cannot see the `storage` schema in either direction. If step 5 touched storage, verify it directly instead:

   ```bash
   docker exec supabase_db_kortex psql -U postgres -d postgres -c \
     "select policyname, cmd from pg_policies where schemaname = 'storage' order by policyname;"
   ```

   That query reads the live database, so it only means something after a reset.

8. **Report.** State the DDL, and what a non-member, a member, and an author can each read and write afterward.

Do **not** run `supabase db reset` or `db push` yourself - ask the user, since reset destroys local data. Step 7's drift check does not need one; a reset is only required to prove the migration applies cleanly and to check anything that must be read back out of the live database (storage policies, `indnullsnotdistinct`).
