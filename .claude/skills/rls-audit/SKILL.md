---
name: rls-audit
description: Run a security review of Kortex authorization - RLS policies, publish visibility, service-role usage, Route Handler clients, and Storage access. Use before merging changes to migrations, app/api/, or lib/supabase/.
disable-model-invocation: false
allowed-tools: Read, Grep, Glob, Bash(rg*), Agent(rls-auditor)
---

Run an authorization audit over: $ARGUMENTS

If no scope was given, audit `supabase/migrations/`, `app/api/`, and `lib/supabase/`.

## Steps

1. Delegate the review to the `rls-auditor` subagent. It is read-only by design.

2. Independently spot-check the two failure modes that matter most, since they are cheap to verify and expensive to miss:

   **Service role in a request path**

   ```
   rg -n 'SERVICE_ROLE|service_role' app/ lib/
   ```

   Any hit inside `app/api/**` or a Server Component serving a user request is critical. Route Handlers must construct their client from the caller's cookies so RLS applies.

   **Publish visibility**

   ```
   rg -n 'published_at|is_published_tree' supabase/migrations/ app/ lib/
   ```

   The read policy must gate on `is_published_tree`, which is true only when the page _and every ancestor_ is published. A policy gating on `published_at IS NOT NULL` alone exposes a published page nested under a draft - the exact case the "Hidden" badge exists to describe.

3. Confirm the `pages_tree_sync` trigger still fires only on `UPDATE OF parent_id, published_at`. Widening it both recurses infinitely and lets `is_published_tree` drift out of sync, which turns a correct policy into a leak.

4. Summarize as **Critical / High / Advisory**, each with file, line, the concrete exposure, and the minimal fix.

State plainly what a non-member, a workspace member, and a page author can each read and write once the reviewed changes land. If nothing is wrong, say so and list what was checked rather than manufacturing findings.
