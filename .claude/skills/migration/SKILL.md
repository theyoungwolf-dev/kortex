---
name: migration
description: Create a new Kortex database migration. Use when the user asks to add or change a table, column, index, trigger, RLS policy, or SQL function, or says "new migration".
argument-hint: What the migration should do
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npx supabase migration new*), Bash(npx supabase migration list*), Bash(npm run db:types), Bash(npm run typecheck)
---

Create a migration for: $ARGUMENTS

Delegate the SQL authoring to the `migration-author` subagent - it holds the schema invariants. Then verify the result yourself.

## Steps

1. **Orient.** List `supabase/migrations/` and read the most recent two files plus `drizzle/schema.ts` so you know current state.

2. **Delegate.** Hand the requirement to `migration-author`. Give it the relevant existing DDL as context.

3. **Scaffold the file.**

   ```bash
   npx supabase migration new <snake_case_name>
   ```

   Write the SQL into the generated file. Lead with a comment: what changes, why, which `CLAUDE.md` invariant it touches.

4. **Verify against the invariants** before declaring done:
   - [ ] Any rank column is `text collate "C"`
   - [ ] Any unique index over a nullable scope column has `NULLS NOT DISTINCT`
   - [ ] Any unique index on a soft-deletable table has `WHERE deleted_at IS NULL`
   - [ ] New tables have `enable row level security` plus explicit policies
   - [ ] Policies include `deleted_at IS NULL` and wrap `auth.uid()` in `(select ...)`
   - [ ] `INSERT` policies have a `WITH CHECK`
   - [ ] No change widens the `pages_tree_sync` trigger's `UPDATE OF` column list
   - [ ] Self-referencing parent changes are cycle-guarded

5. **Mirror into Drizzle.** Update `drizzle/schema.ts` so it stays the source of truth. Note in your summary if the migration uses SQL that Drizzle cannot express - that's expected for collations and partial indexes.

6. **Regenerate and check.**

   ```bash
   npm run db:types
   npm run typecheck
   ```

7. **Report.** State the DDL, and what a non-member, a member, and an author can each read and write afterward.

Do **not** run `supabase db reset` or `db push` yourself - ask the user, since reset destroys local data.
