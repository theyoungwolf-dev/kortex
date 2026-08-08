---
name: regen-types
description: Regenerate lib/database.types.ts from the Supabase schema and fix the resulting type errors. Use after applying a migration or when TypeScript disagrees with the database shape.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Bash(npm run db:types), Bash(npm run typecheck), Bash(npx supabase status)
---

Regenerate database types and reconcile the codebase.

## Steps

1. Confirm the local stack is running:

   ```bash
   npx supabase status
   ```

   If it is not, stop and tell the user to run `supabase start` - do not start it yourself, and do not fall back to generating from the remote project.

2. Regenerate:

   ```bash
   npm run db:types
   ```

3. Typecheck:

   ```bash
   npm run typecheck
   ```

4. Fix the fallout **in application code**, never in `lib/database.types.ts`. That file is generated and is write-protected in project settings; editing it hides a real mismatch until runtime.

   Common shapes of breakage after a migration:
   - A new nullable column widens a type - handle the null rather than asserting it away.
   - A renamed column breaks `.select()` strings, which are typed but easy to miss in template literals.
   - A new enum value makes an exhaustive `switch` non-exhaustive - add the case.
   - An embedded resource (`.select('*, collection:collections(id)')`) changes arity between one-to-one and one-to-many.

5. Re-run `npm run typecheck` until clean, then report which files changed and why.

Do not use `any`, `as unknown as`, or `@ts-expect-error` to silence a generated-type mismatch. If the types and the code genuinely disagree, the migration or the query is wrong - say so instead of suppressing it.
