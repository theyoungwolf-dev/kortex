# Kortex - Architecture

Kortex is an open-source, multi-tenant knowledge base. A workspace contains collections; a collection contains an arbitrarily deep tree of pages; a page holds rich-text content and can be published independently. Everything orderable is drag-reorderable, and every user keeps their own ordered list of favourites.

This document is the design of record. It covers the data model, the authorization model, the two subsystems that carry the most risk (ranking and publish visibility), the API surface, the frontend architecture, and the local-development and self-hosting story.

Its companion is `LIB.md`, which documents the `lib/` implementation of everything below: the PostgREST select syntax and embedding hints, the four Supabase client factories and why identity lives in the client object, the isomorphic query layer, and the server-to-client cache contract. Where this document says what the system is, that one says how it is built and which mistakes are silent.

---

## 1. Domain model

### Entities

| Entity               | Description                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Workspace**        | The tenant boundary. Every other row belongs to exactly one.                                                                                                                                                    |
| **Workspace member** | A user's membership in a workspace, carrying a role.                                                                                                                                                            |
| **Collection**       | A named, described, emoji-iconed container for pages. Ordered within its owner's list. Owned either personally by a member or by the workspace as a whole.                                                      |
| **Page**             | Title plus rich-text JSON content. Belongs to a collection and optionally to a parent page, forming an unbounded-depth tree. Ordered within its sibling group. Has a nullable `published_at`; null means draft. |
| **Starred page**     | A user's favourite, carrying its own rank so each user has a personally ordered favourites list.                                                                                                                |
| **Page view**        | Who read a page and when, with a repeat-visit counter.                                                                                                                                                          |
| **Page attachment**  | A file uploaded into a page's content or attached to it.                                                                                                                                                        |

### Core behaviours

1. **Ordering** - three independent lexorank scopes: collections within an owner, pages within a `(collection, parent)` group, and starred pages within a user. New items prepend to the top of their list.
2. **Publish visibility** - a page is visible to someone other than its author only when it _and every one of its ancestors_ is published. A published page beneath a draft parent exists but is unreachable; the UI calls this state **Hidden**.
3. **Lazy tree loading** - sidebar nodes fetch their children only when expanded, paginated.
4. **Autosave** - title and content save on a debounce, with a save-status indicator.
5. **Trash** - deletes are soft, reversible for 30 days, then purged.

### Product surfaces

- **Sidebar** - Favourites, My Collections, and Workspace Collections, each a drag-reorderable tree.
- **Page view** - title, metadata row (last editor, edited/created timestamps, view count with reader avatars), rich-text editor, and a tabbed panel showing child pages and details.
- **Collection view** - icon picker, title, description, and the same tabbed panel.
- **Header** - publish state badge and toggle, star toggle, copy link, delete.

---

## 2. Stack

| Layer                   | Choice                                                        |
| ----------------------- | ------------------------------------------------------------- |
| Framework               | Next.js, App Router                                           |
| Language                | TypeScript                                                    |
| UI                      | Tailwind + shadcn/ui                                          |
| Database, auth, storage | Supabase (Postgres)                                           |
| Data access             | `supabase-js` over PostgREST                                  |
| Schema authoring        | Declarative SQL (`supabase/schemas/`), diffed into migrations |
| Server logic            | Next.js Route Handlers                                        |
| Client cache            | TanStack Query                                                |
| Drag and drop           | `@dnd-kit/core` + `@dnd-kit/sortable`                         |
| Editor                  | Tiptap                                                        |
| Ordering                | `@theyoungwolf/lexorank`, wrapped behind `lib/rank/`          |
| URL state               | `nuqs`                                                        |
| i18n                    | `next-intl`                                                   |
| Package manager         | npm                                                           |

Three landmines that will silently corrupt ordering or leak drafts if missed: **text collation on rank columns** (§4.2), **`NULLS NOT DISTINCT` on sibling unique indexes** (§4.1), and **the narrow trigger definition in the visibility subsystem** (§6). Read those closely.

---

## 3. Two decisions worth recording

### 3.1 PostgREST rather than pg_graphql

Supabase exposes the database two ways: PostgREST (used by `supabase-js`) and pg_graphql, a GraphQL endpoint reflected from the SQL schema. Both respect RLS. Kortex uses PostgREST.

pg_graphql is more capable than it's often given credit for, and several plausible objections to it don't hold:

- Computed fields work. A SQL function taking the table type as its argument becomes a field on that type, which covers derived booleans like `is_published` or `is_starred`.
- Custom mutations work. Volatile SQL functions can be exposed as mutation fields.
- It compiles an entire GraphQL document into a single SQL statement, so nested reads have no N+1 problem and need no dataloader. This is a genuine advantage over PostgREST's embedded resources.

The reasons Kortex uses PostgREST anyway:

1. **One client instead of two.** `supabase-js` already carries auth token refresh, Storage, and Realtime. Choosing GraphQL puts the database on a different transport from everything else, with its own auth plumbing.
2. **One type pipeline instead of two.** `supabase gen types typescript` produces a fully typed database with no codegen step. GraphQL needs schema introspection plus `graphql-codegen` kept green in CI.
3. **Looser schema coupling.** pg_graphql reflects tables directly, so renaming a column breaks the API. The mitigation is `comment on table ... is '@graphql({...})'` directives - a configuration surface living inside SQL comments, easy to overlook in review.
4. **Write-path coherence.** The reorder endpoints must be Route Handlers regardless (§7.2). Using GraphQL for reads would leave two API styles in one codebase.
5. **Contributor onboarding.** For an open-source project, more people can read and debug `.from('pages').select()` than a pg_graphql compilation.

The deciding factor is the access pattern. The sidebar loads lazily - each node fetches its own children only when expanded, so **every query is exactly one level deep**. Single-statement compilation of deeply nested documents is pg_graphql's strongest card, and this UI never plays it. A flat, one-level-at-a-time query is what PostgREST does with the least ceremony.

This is a preference decision with modest technical weight, not a correctness one. It is recorded here so it isn't relitigated casually, not because the alternative is wrong.

### 3.2 Declarative SQL for schema authoring, no ORM at all

```
supabase/schemas/*.sql     ← single source of truth, reviewable in PRs
  ↓ supabase db diff -f <name>
supabase/migrations/*.sql  ← what ships; hand-editable and owned by us
  ↓ supabase migration up
Postgres
  ↓ supabase gen types typescript
lib/database.types.ts      ← consumed by supabase-js at runtime
```

**Runtime queries go through `supabase-js`, never an ORM client.** An ORM client connects directly to Postgres and authenticates as a database role rather than as the end user, which means RLS does not apply and every authorization rule would have to be reimplemented in TypeScript. Two authorization systems will drift. Routing all runtime access through PostgREST makes RLS the single place authorization lives - safer, and far easier for contributors to audit. This part of the decision is not a preference; it is what makes §5 sound.

**Why no ORM at authoring time either.** Kortex originally carried Drizzle for this job, on the theory that a typed `schema.ts` gives contributors an at-a-glance model and generates migrations for free. It was removed, because the schema needs exactly the constructs the DSL cannot express:

| Construct                                                | Why it is needed                                   | Drizzle                                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rank text collate "C"`                                  | §4.2 - bytewise ordering must match JavaScript     | `text()` takes only `{ enum }`, and drizzle-kit never emits `COLLATE`                                                                                            |
| `nulls not distinct` **with** `where deleted_at is null` | §4.1 - one index covering null and non-null scopes | `nullsNotDistinct()` exists only on `unique()` constraints, which cannot be partial; `uniqueIndex()` has `where` but no `nullsNotDistinct`. Mutually unreachable |
| `pages_tree_sync` and its plpgsql                        | §6 - the whole visibility subsystem                | Not modelled at all                                                                                                                                              |

Those are precisely the three landmines named in §2. Prisma is a worse fit for the same reasons and then some. The deeper problem is that **drizzle-kit diffs `schema.ts` against its own JSON snapshot, never against the database** - so a hand-added `COLLATE "C"` is invisible to it forever, the snapshot becomes a false model of production, and nothing can detect the drift.

**Generated SQL is a draft, not an output.** This is still true, and it is the honest cost of the current approach. Every generated migration must be read and corrected before it ships. What changed is that the source of truth stays correct regardless, and drift is now _detectable_:

> **`supabase db diff` on a clean tree must print "No schema changes found."** That is the check that the migrations and `supabase/schemas/` actually agree. A snapshot-based tool cannot make this promise.

**What the diff actually compares.** Both `supabase/schemas/` and `supabase/migrations/` are applied to throwaway shadow databases and their catalogs compared. The running local database is not a side of the comparison - editing it by hand changes nothing about the result, and a clean diff does not certify that your local database matches either directory. `--local` opts into comparing migrations against the live local database.

**What must always be hand-written into migrations**, because the diff never emits it:

- `NULLS NOT DISTINCT` on the two sibling-rank indexes (§4.1, §4.2). The engine compares the property but cannot emit it, so a lost clause surfaces as a proposed `DROP INDEX` + `CREATE UNIQUE INDEX` on a sibling-rank index. Regenerating emits the same defective DDL; hand-editing is the only fix.
- Everything in the `storage` schema, including the object policies of §10. Objects there are invisible in **both** directions - not emitted, not diffed, not reported as drift, and `-s storage` does not re-enable them. The shadow database makes the reason visible: applying a `create table` in that schema fails with `permission denied for schema storage`, because `storage` belongs to `supabase_admin` and its tables to `supabase_storage_admin`. Those schemas are upgraded by the platform on its own schedule, so a differ that tracked them would report every Storage release as drift and could generate migrations that rewrite platform tables. Policies you author there are collateral damage of that exclusion.
- `REVOKE`s against `anon`. The diff emits `REVOKE ... FROM PUBLIC` but treats anything derived from default privileges as a no-op.
- Any DML - notably the bucket rows themselves, which live in `supabase/seed.sql`.

A trigger attached to `auth.users` is **not** subject to this: `on_auth_user_created` is emitted on creation and its removal is detected as drift. The blind spot is specific to `storage`, not to every Supabase-managed schema.

Because storage is invisible to the drift check, changes to `supabase/schemas/11_storage.sql` have to be verified against the database directly - `select policyname, cmd from pg_policies where schemaname = 'storage'`.

---

## 4. Data model

> **`supabase/schemas/*.sql` is the source of truth for the exact DDL.** The SQL below is abridged to the columns that carry design weight - it explains _why_ the shape is what it is, and it is not a substitute for reading the schema files. Where the two disagree, the schema files are right and this section is a bug.

### 4.1 Identity, tenancy, collections

`profiles` is the public mirror of `auth.users`, which RLS cannot expose to clients. Every user-facing foreign key points at `profiles`, never at `auth.users`, so display name and avatar are readable under policy. Rows are created by the `handle_new_user` trigger on signup, which also provisions a personal workspace, an `owner` membership, a starter collection and a published welcome page.

```sql
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,          -- unique, lowercase, 3-32 chars
  display_name text,
  avatar_path  text,                   -- object path in the `avatars` bucket, never a URL
  ...                                  -- bio, job_title, company, location, website, pronouns
  timezone     text not null default 'UTC',
  locale       text not null default 'en'
);

create type workspace_role as enum ('owner', 'admin', 'member', 'guest');

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,           -- unique index; lowercase + format enforced by check
  name        text not null default 'Untitled workspace',
  logo_path   text,                    -- object path in the `workspace-logos` bucket
  is_personal boolean not null default false,
  created_by  uuid not null references profiles(id) on delete restrict,
  deleted_at  timestamptz
);

create table workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         workspace_role not null default 'member',
  unique (workspace_id, user_id)
);

create table collections (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  private_to     uuid references profiles(id) on delete cascade,
  name         text not null default 'Untitled',
  icon         text,                   -- emoji grapheme
  rank         text collate "C" not null,
  created_by   uuid not null references profiles(id) on delete restrict,
  deleted_at   timestamptz
);

create unique index collections_scope_rank_key
  on collections (workspace_id, private_to, rank)
  nulls not distinct
  where deleted_at is null;
```

Ownership is two-valued and carried by **nullability alone**. There is no `owner_kind` enum and no `owner_member_id`: `private_to is null` means the collection belongs to the workspace, and a non-null `private_to` means it is personal to that profile. One nullable column replaces an enum plus a discriminated FK plus the check constraint keeping them consistent, and it is what the RLS policies test.

| Sidebar section       | Filter                             |
| --------------------- | ---------------------------------- |
| My Collections        | `private_to = (select auth.uid())` |
| Workspace Collections | `private_to is null`               |

Membership is not the only way in: `workspace_invitations` stores a **hash** of the invite token, never the token itself, so a database leak cannot reconstruct a working invite link. `create_workspace_invitation()` returns the raw token exactly once, and `accept_workspace_invitation()` is the single sanctioned path to a membership row - an invitee is not yet a member, so no policy could let them insert one.

> **`NULLS NOT DISTINCT` (Postgres 15+) is load-bearing.** Postgres normally treats `NULL` values as distinct in a unique index, so a plain unique index on `(workspace_id, private_to, rank)` would place no constraint at all on workspace-owned collections, whose `private_to` is null. The same applies to root pages in §4.2. Without this clause you would need two separate partial indexes per table; with it, one index covers both cases.

### 4.2 Pages

```sql
create table pages (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references workspaces(id) on delete cascade,
  collection_id       uuid not null references collections(id) on delete cascade,
  collection_private_to uuid references profiles(id) on delete cascade,
  parent_id           uuid references pages(id) on delete cascade,

  title               text not null default 'Untitled',
  content             jsonb not null default '{}'::jsonb,
  published_at        timestamptz,

  rank                text collate "C" not null,

  -- trigger-maintained tree state; see §6
  depth               int generated always as (coalesce(array_length(ancestor_ids, 1), 0)) stored,
  ancestor_ids        uuid[] not null default '{}',
  is_published_tree   boolean not null default false,

  created_by          uuid not null references profiles(id) on delete restrict,
  last_edited_by      uuid references profiles(id) on delete set null,
  last_edited_at      timestamptz not null default now(),
  deleted_at          timestamptz
);

create unique index pages_sibling_rank_key
  on pages (collection_id, parent_id, rank)
  nulls not distinct
  where deleted_at is null;

create index pages_level_idx on pages (collection_id, parent_id, rank)
  where deleted_at is null;
create index pages_ancestors_idx on pages using gin (ancestor_ids);
```

Both `workspace_id` and `collection_private_to` are denormalized from the collection so RLS policies can filter without a join - `collection_private_to` is what lets a single policy express "this page is in a private collection that isn't mine" without touching `collections`. Neither is trusted from the client: the `pages_set_scope` BEFORE trigger derives both from `collection_id`, so the `WITH CHECK` clause always sees corrected values and a client cannot smuggle in a workspace it has no membership in.

`depth` is a **generated column**, not trigger-maintained state - it falls out of `ancestor_ids` and cannot drift from it.

> **`collate "C"` on every rank column is not optional.** Supabase databases default to a locale-aware collation, typically `en_US.UTF-8`, under which `ORDER BY rank` does _not_ sort bytewise - punctuation and case carry different weights. Lexorank values are compared with plain `<` in JavaScript, which _is_ bytewise. Mismatch means Postgres and the client disagree about which of two ranks is smaller, and the symptom is a list that looks right immediately after a drag and reshuffles on refresh. `COLLATE "C"` forces bytewise comparison and keeps both sides in agreement.

### 4.3 Stars, views, attachments

```sql
create table page_stars (
  user_id    uuid not null references profiles(id) on delete cascade,
  page_id    uuid not null references pages(id) on delete cascade,
  rank       text collate "C" not null,
  primary key (user_id, page_id),
  constraint page_stars_user_rank_key unique (user_id, rank)
);

create table page_views (
  user_id         uuid not null references profiles(id) on delete cascade,
  page_id         uuid not null references pages(id) on delete cascade,
  view_count      int not null default 1,
  first_viewed_at timestamptz not null default now(),
  viewed_at       timestamptz not null default now(),
  primary key (user_id, page_id)
);

create table attachments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  page_id      uuid references pages(id) on delete cascade,   -- nullable: editor staging
  bucket_id    text not null default 'attachments',
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  width        int,
  height       int,
  uploaded_by  uuid not null references profiles(id) on delete restrict
);
```

The tables are `page_stars` and `attachments` - not `starred_pages` or `page_attachments`. Three details carry design weight:

- `page_stars` has **no `deleted_at`**. Unstarring is a real delete, so its unique index carries no soft-delete predicate; it is the one rank scope that does not.
- `attachments.page_id` is **nullable**. The editor uploads before the node is committed, so an orphan row is a legitimate state; policies grant the uploader access to their own orphans, and `attachments_set_scope` stamps `workspace_id` from the page once one is attached.
- Deleting an `attachments` row deletes the object from the bucket via the `attachments_delete_object` trigger, so a page cascade does not leave bytes behind.

### 4.4 Soft delete

`workspaces`, `collections` and `pages` carry `deleted_at`, which powers a 30-day Trash. The join tables (`page_stars`, `page_views`, `attachments`) do not - their rows are cheap to recreate and are hard-deleted.

- Deleting is `update ... set deleted_at = now()`.
- Every RLS `USING` clause on a soft-deletable table includes `deleted_at is null`. Each also has a second `SELECT` policy for the trash view, `OR`'d with the live one, so clients filter `deleted_at=is.null` normally and `deleted_at=not.is.null` on the Trash screen.
- Every unique index on those tables includes `where deleted_at is null`, so a deleted row never holds a rank slot hostage.
- **Trash permission is enforced in a trigger, not a policy.** Trashing is an `UPDATE`, so the ordinary update policy would let any member bin a shared collection. `collections_guard_trash` and `pages_guard_trash` see `OLD` and `NEW` together and narrow the destructive half to the author, the owner, or a workspace admin.
- Trashing a collection cascades to its live pages through `collections_cascade_trash`, and restoring it brings back exactly the pages that went down with it (matched on the same `deleted_at` timestamp).

Two pieces are specified but **not yet implemented**: cascading a soft delete down a page subtree via `ancestor_ids @> array[id]`, and the `pg_cron` job that purges rows past the retention window. Neither exists in `supabase/schemas/` today.

---

## 5. Authorization

RLS is the only authorization layer. Application code never decides who may read a row.

```sql
create or replace function public.is_workspace_member(p_workspace uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = p_workspace and m.user_id = auth.uid()
  );
$$;

alter table pages enable row level security;

create policy pages_select on pages for select to authenticated
using (
  deleted_at is null
  and (select is_workspace_member(workspace_id))
  and (is_published_tree or created_by = (select auth.uid()))
);

create policy pages_insert on pages for insert to authenticated
with check (
  (select is_workspace_member(workspace_id))
  and created_by = (select auth.uid())
);

create policy pages_update on pages for update to authenticated
using (
  deleted_at is null
  and (select is_workspace_member(workspace_id))
  and (is_published_tree or created_by = (select auth.uid()))
);
```

Two details matter:

- **Wrap `auth.uid()` and helper calls in `(select ...)`.** This lets Postgres hoist them into an InitPlan evaluated once per query rather than once per row. On a table of any size it is the difference between a couple of milliseconds and most of a second.
- **`is_published_tree`, not `published_at`.** Gating on `published_at is not null` alone would expose a published page nested under a draft parent - precisely the case the Hidden state exists to describe. See §6.

**Service role is forbidden in request paths.** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely. It belongs in migrations and admin scripts only. Route Handlers construct their Supabase client from the caller's cookies so policies continue to apply.

### Expected behaviour

Any change touching authorization must be describable in this table:

| Actor                            | Sees                                    |
| -------------------------------- | --------------------------------------- |
| Anonymous / non-member           | Nothing                                 |
| Workspace member, not the author | Pages where `is_published_tree` is true |
| Page author                      | The above, plus their own drafts        |

---

## 6. Publish visibility

### The rule

> A page is visible to anyone but its author only if it _and every ancestor above it_ has been published. A published page under a draft parent is **Hidden**: it exists, it is published, and nobody but the author can reach it.

Evaluated naively this is a recursive walk up the ancestor chain on every read - too expensive for an RLS policy, which runs per row.

### The design: denormalize, maintain by trigger

Publishing is rare; reading is constant. So `is_published_tree` is computed once at publish time and stored.

```sql
create or replace function public.pages_recompute_subtree(p_root uuid)
returns void language plpgsql as $$
begin
  with recursive sub as (
    select
      p.id,
      coalesce(par.ancestor_ids, '{}'::uuid[])
        || case when p.parent_id is null then '{}'::uuid[] else array[p.parent_id] end
        as ancestor_ids,
      (p.published_at is not null) and coalesce(par.is_published_tree, true) as pub
    from pages p
    left join pages par on par.id = p.parent_id
    where p.id = p_root

    union all

    select
      c.id,
      sub.ancestor_ids || c.parent_id,
      sub.pub and (c.published_at is not null)
    from pages c
    join sub on c.parent_id = sub.id
    where c.deleted_at is null
  )
  update pages p set
    ancestor_ids      = sub.ancestor_ids,
    depth             = coalesce(array_length(sub.ancestor_ids, 1), 0),
    is_published_tree = sub.pub
  from sub
  where p.id = sub.id;
end $$;

create or replace function public.pages_tree_sync()
returns trigger language plpgsql as $$
begin
  perform public.pages_recompute_subtree(new.id);
  return null;
end $$;

create trigger pages_tree_sync_aiu
  after insert or update of parent_id, published_at on pages
  for each row execute function public.pages_tree_sync();
```

> **Why this doesn't recurse forever.** The trigger is declared `UPDATE OF parent_id, published_at`, and `pages_recompute_subtree` writes only `ancestor_ids`, `depth`, and `is_published_tree`. The cascading update therefore never re-fires the trigger. This is load-bearing: widening the trigger to fire on any update produces an infinite loop.

### What follows from the stored column

| Question                      | Answer                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| Can this user read this page? | The `pages_select` policy - no extra query                                            |
| Is the page published?        | `published_at is not null`                                                            |
| Is it Hidden?                 | `published_at is not null and not is_published_tree`                                  |
| Publish or unpublish          | A plain `update pages set published_at = ...`; the trigger cascades the whole subtree |

No RPC is required for publishing.

### Cycle guard

Drag-and-drop makes it easy to attempt dropping a page into its own descendant. A `BEFORE UPDATE` trigger rejects the move.

The check must look at **the target parent's ancestor chain**, not at `new.ancestor_ids`:

```sql
-- reject if the page is its own parent
new.parent_id = new.id
-- or if the page appears among its NEW parent's ancestors
new.id = any((select ancestor_ids from pages where id = new.parent_id))
```

> **Not `new.parent_id = any(new.ancestor_ids)`.** That formulation is wrong in both directions. This is a `BEFORE` trigger, so `new.ancestor_ids` still holds the row's _old_ chain - it has not been recomputed yet. Moving a page under its own descendant therefore passes the test (a descendant is never an ancestor), while reparenting a page onto its own grandparent - a perfectly ordinary drag - is rejected. The guard has to ask "am I among my new parent's ancestors", which is the question that actually describes a cycle.

---

## 7. Ordering

### 7.1 Scopes and algorithm

| Scope                       | Unique index                       |
| --------------------------- | ---------------------------------- |
| Collections within an owner | `(workspace_id, private_to, rank)` |
| Pages within a parent       | `(collection_id, parent_id, rank)` |
| Starred pages within a user | `(user_id, rank)`                  |

**Create** prepends: read the current first sibling's rank and compute a rank before it, or the initial rank if the list is empty.

**Reorder** takes `(itemId, newParentId, prevId | null)`:

1. If `prevId` is null, the next-adjacent rank is the first sibling under `newParentId`. Otherwise `prevRank` is that sibling's rank, and the next-adjacent rank is the smallest sibling rank strictly greater than it - **scoped to the destination parent**, not the source.
2. Exit early if the item already occupies that slot. Check this in both branches; it prevents pointless writes on no-op drags.
3. Compute a rank between `prevRank` and `nextRank`.
4. Update `rank` and `parent_id` in one statement.
5. On Postgres error `23505`, append an entropy suffix to the rank and retry **once**.

The entropy retry is the collision strategy. It is deliberately not a rebalance pass: rebalancing rewrites every sibling and turns a rare conflict into a large write.

### 7.2 Where the code lives

Ordering runs in Next.js Route Handlers:

```
POST /api/pages/reorder
POST /api/collections/reorder
POST /api/starred/reorder
```

All three share one generic implementation parameterised by table and scope columns.

Not in the browser - the retry loop would die with the tab, and the computation would be client-trusted. Not in SQL - the lexorank implementation is a JavaScript package.

The handler builds its Supabase client from the **caller's access token**, not the service role key, so RLS still governs which siblings are visible and reorderable.

```ts
// lib/supabase/route.ts
export function createRouteClient(request: NextRequest) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, // NOT service_role
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {}, // proxy.ts owns refresh; its matcher must cover /api/*
      },
    },
  );
}
```

Sketch:

```ts
const { pageId, parentId, prevId } = ReorderSchema.parse(await req.json());
const db = createRouteClient();

const { data: page } = await db.from("pages").select("id, collection_id, parent_id, rank").eq("id", pageId).single();
if (!page) return notFound();

const siblings = () =>
  db.from("pages").select("id, rank").eq("collection_id", page.collection_id).is("deleted_at", null);

const scoped = (q) => (parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId));

let prevRank: string | null = null;
let nextRank: string | null = null;

if (prevId) {
  const { data: prev } = await siblings().eq("id", prevId).single();
  if (!prev) return badRequest("prev.id");
  prevRank = prev.rank;
  const { data: next } = await scoped(siblings()).gt("rank", prev.rank).order("rank").limit(1).maybeSingle();
  if (next?.id === pageId && page.parent_id === parentId) return ok(); // no-op
  nextRank = next?.rank ?? null;
} else {
  const { data: first } = await scoped(siblings()).order("rank").limit(1).maybeSingle();
  if (first?.id === pageId && page.parent_id === parentId) return ok(); // no-op
  nextRank = first?.rank ?? null;
}

let rank = rankOps.between(prevRank, nextRank);
for (let attempt = 0; attempt < 2; attempt++) {
  const { error } = await db.from("pages").update({ rank, parent_id: parentId }).eq("id", pageId);
  if (!error) return ok();
  if (error.code !== "23505") throw error;
  rank = rank + rankOps.entropy(); // collision → jitter → retry
}
return conflict();
```

Note `.is('parent_id', null)` rather than `.eq(...)` - PostgREST requires `is` for null comparison.

### 7.3 The `lib/rank` wrapper

`@theyoungwolf/lexorank` is a first-party package, so its API may move. Only `lib/rank/index.ts` imports it; everything else imports from `lib/rank`.

```ts
export interface RankOps {
  first(): string;
  between(prev: string | null, next: string | null): string;
  entropy(): string;
}
```

Guarantees the wrapper must provide regardless of the underlying package:

- `between(null, null)` equals `first()`
- `between(prev, null)` is strictly greater than `prev`
- `between(null, next)` is strictly less than `next`
- `between(prev, next)` is strictly between them
- Every returned value compares correctly under plain JavaScript `<`, matching `COLLATE "C"` on the database side

The case to test hardest is `between()` on **adjacent** ranks, where no value exists in the gap. A naive midpoint implementation either throws or returns a duplicate - and a duplicate is absorbed by the `23505` retry, so the underlying bug hides behind a system that appears to work.

### 7.4 Pagination

Rank is unique within its scope, so it is a total order there and the pagination cursor is simply the last rank string:

```ts
let q = supabase
  .from("pages")
  .select("id, title, rank, published_at, is_published_tree")
  .eq("collection_id", collectionId)
  .is("parent_id", null)
  .is("deleted_at", null)
  .order("rank", { ascending: true })
  .limit(21); // 20 + 1 to detect hasNextPage

if (cursor) q = q.gt("rank", cursor);
```

No encoding, no composite tuple, no tiebreak column.

Sorting by a non-unique column such as `title` or `updated_at` would need a composite keyset with an ID tiebreak, expressed in PostgREST as `.or(\`title.gt.${t},and(title.eq.${t},id.gt.${id})\`)`. Without the tiebreak, rows are silently dropped at page boundaries. Rank ordering is what the tree uses, so this is not needed initially.

### 7.5 Starred pages

Because each user's favourites carry their own rank on the join table, the favourites list queries that table directly and embeds the page:

```ts
supabase
  .from("page_stars")
  .select("rank, page:pages(id, title, published_at, is_published_tree, collection_id, parent_id)")
  .order("rank", { ascending: true });
```

There is no per-page "starred rank" column and no join-ordered page query.

---

## 8. API surface

### Direct PostgREST

| Operation                   | Call                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| List collections by section | `.from('collections').select().eq('workspace_id',…)` then `.is('private_to', null)` or `.eq('private_to', uid)` |
| List sibling pages          | `.from('pages').select().eq('collection_id',…).is('parent_id',…)`                                               |
| Get a page                  | `.from('pages').select('*, collection:collections(id,name)').eq('id',…).single()`                               |
| Create                      | `.insert({ …, rank: computedRank })`                                                                            |
| Rename / autosave           | `.update({ title })` / `.update({ content })`                                                                   |
| Publish / unpublish         | `.update({ published_at: now \| null })` - trigger cascades                                                     |
| Soft delete                 | `.update({ deleted_at: now })`                                                                                  |
| Star / unstar               | `.insert()` / `.delete()` on `page_stars`                                                                       |
| Record a view               | `rpc('record_page_view', { p_page_id })` - a single upsert, bumps `view_count`                                  |
| Favourites list             | `.from('page_stars').select('rank, page:pages(*)')`                                                             |

### Route Handlers

| Route                           | Why it isn't a direct call                             |
| ------------------------------- | ------------------------------------------------------ |
| `POST /api/pages/reorder`       | Multi-step read → compute → write with collision retry |
| `POST /api/collections/reorder` | Same                                                   |
| `POST /api/starred/reorder`     | Same                                                   |
| `POST /api/pages`               | Creation needs a prepend-rank read first               |
| `POST /api/uploads/sign`        | Issues a workspace-scoped signed upload URL            |
| `POST /api/stripe/webhook`      | Signature verification                                 |

Every handler validates its body with a Zod schema before touching the database.

### SQL functions

Default to plain PostgREST. Add an RPC only when a single transaction is genuinely required, and state why in the migration comment. Two candidates, neither needed at launch:

- `soft_delete_page_subtree(uuid)` - one statement, but atomicity is reassuring.
- `reorder_page_locked(...)` - takes `pg_advisory_xact_lock(hashtext(collection_id || parent_id))` to fully serialise concurrent reorders in a sibling list. The entropy retry already resolves collisions; add this only if `23505` shows up in production logs.

### Background work

No external job queue.

- **Page views** - a single upsert, fire-and-forget, a few milliseconds. No queue justified.
- **Trash purge** - `pg_cron`, nightly.
- **Orphaned attachment cleanup** - `pg_cron` sweep, or a Storage lifecycle rule.

If a real queue becomes necessary, use `pgmq` before introducing infrastructure outside Postgres.

---

## 9. Frontend

### 9.1 Routing

```
app/
  (marketing)/page.tsx
  (auth)/login/page.tsx
  (app)/
    layout.tsx                                auth guard, workspace resolution
    w/[workspaceSlug]/
      layout.tsx                              shell: sidebar + header
      pages/
        page.tsx                              welcome state
        [pageId]/page.tsx                     page view
        c/[collectionId]/page.tsx             collection view
```

Collections get a real route segment rather than a query parameter, which gives correct back-button behaviour and lets the router do the switching between the three right-hand panes.

Server/client split:

- `layout.tsx` - Server Component; resolves workspace and membership, renders the shell.
- **Sidebar** - Client Component. It is a drag-and-drop tree with lazy expansion and per-node local state.
- **Page and collection views** - Server Components. They fetch, resolve signed image URLs (§10), and hand content to a client editor.

### 9.2 Data layer

Implemented in `lib/queries/` and `lib/query/`; see `LIB.md` §6 for the isomorphic query layer and §7 for the dehydrate/hydrate contract these keys hang on.

```ts
const keys = {
  collections: (ws: string, kind: OwnerKind) => ["collections", ws, kind] as const,
  siblings: (collectionId: string, parentId: string | null) => ["pages", collectionId, parentId ?? "root"] as const,
  page: (id: string) => ["page", id] as const,
  starred: (userId: string) => ["starred", userId] as const,
};
```

**`siblings` must match the rank uniqueness scope exactly.** A key that omits `parentId` lets a reorder in one branch invalidate or corrupt another.

Optimistic reorder:

```ts
useMutation({
  mutationFn: reorderPage,
  onMutate: async ({ collectionId, parentId, from, to }) => {
    const key = keys.siblings(collectionId, parentId);
    await qc.cancelQueries({ queryKey: key });
    const prev = qc.getQueryData<Page[]>(key);
    qc.setQueryData<Page[]>(key, (old = []) => arrayMove(old, from, to));
    return { key, prev };
  },
  onError: (_e, _v, ctx) => ctx && qc.setQueryData(ctx.key, ctx.prev),
  onSettled: (_d, _e, _v, ctx) => ctx && qc.invalidateQueries({ queryKey: ctx.key }),
});
```

Lazy expansion is `useInfiniteQuery({ …, enabled: isExpanded })`. Children are never fetched for a collapsed node.

### 9.3 Drag and drop

`@dnd-kit/core` + `@dnd-kit/sortable`:

- One `<DndContext onDragEnd>` per tree.
- One `SortableContext` per sibling list, with a stable id such as `${parentId}-children`.
- Each node uses `useSortable({ id })`, spreading `attributes` and `listeners` onto its drag handle.
- Cross-list moves are detected by reading `over.data.current.sortable.containerId` in `onDragEnd`; that container's parent id becomes `newParentId`.

### 9.4 Autosave

Debounced writes: title 500 ms, content 700 ms.

- **Conflict guard.** Send the known `updated_at` and filter on it. Zero rows updated means another writer got there first - refetch and warn rather than clobbering.
- **Flush on unmount and on `visibilitychange`**, so navigating away doesn't drop the final keystrokes.
- The save indicator appears immediately on the first pending write and lingers about a second after completion, so fast saves don't flicker.

### 9.5 UI conventions

- Interactive state is expressed with `data-` attributes (`data-active`, `data-dragging`, `data-deleting`) and styled with Tailwind's `data-[...]` variants.
- Forms use `react-hook-form` with `@hookform/resolvers/zod`.
- **All user-facing strings go through `next-intl` from the first commit.** Retrofitting i18n across a finished UI is miserable, and an open-source project will attract translation contributions early.

---

## 10. Editor and media

### Content

Page content is Tiptap JSON stored in a `jsonb` column. The editor is wrapped in `dynamic(() => …, { ssr: false })` because Tiptap touches `document` at construction.

The slash-command menu uses Tiptap's `Suggestion` plugin with a shadcn `<Command>` popup.

### Image pipeline

**Upload**

1. The client requests `POST /api/uploads/sign`. The server validates workspace membership and returns a signed upload URL for `attachments/{workspace_id}/{page_id}/{uuid}-{filename}`.
2. The client uploads directly to Storage.
3. The client inserts a Tiptap image node with `attrs: { path }` - **a storage path, never a URL**. A URL saved into the document would expire.
4. The server records an `attachments` row.

**Read**, in the page's Server Component:

1. Walk the content collecting every image `path`.
2. One batched `storage.from('attachments').createSignedUrls(paths, 3600)`.
3. Inject `src` into a copy of the content handed to the editor.
4. Strip `src` before saving. Only `path` is authoritative.

The `attachments` bucket is private; `avatars` and `workspace-logos` are public-read and owner-writable. Storage policies authorize by reading the **first folder segment** of the object name, so the path conventions are load-bearing:

```
avatars/          <user_id>/<filename>
workspace-logos/  <workspace_id>/<filename>
attachments/      <workspace_id>/<page_id>/<uuid>-<filename>
```

A malformed path fails closed: `safe_uuid()` returns null rather than raising, and `is_workspace_member(null)` is false. Attachment access is authorized at **workspace** granularity, not per page - a signed URL is only ever handed out by a caller that already passed the page-level check on `public.attachments`, and a per-object page lookup would put a join on the hot path of every download.

---

## 11. SaaS layer

| Concern   | Approach                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth      | Supabase Auth - email OTP plus GitHub and Google OAuth                                                                                                                  |
| Signup    | `handle_new_user` on `auth.users` insert creates a profile, a personal workspace, an `owner` membership, a starter collection and a published welcome page              |
| Invites   | `workspace_invitations` stores a token **hash**; `create_workspace_invitation()` returns the raw token once, `accept_workspace_invitation()` inserts the membership row |
| Roles     | `owner / admin / member / guest` (the `workspace_role` enum), enforced in RLS through the `10_helpers.sql` predicates                                                   |
| Billing   | Stripe Checkout and Customer Portal; a webhook Route Handler writes `subscriptions`; plan limits enforced in RLS `WITH CHECK`                                           |
| Search    | Postgres FTS over `title` plus `jsonb_to_tsvector(content)`, as a generated `tsvector` column with a GIN index. `pgvector` semantic search later.                       |
| Analytics | `page_views` already supports per-page read analytics - worth surfacing in the UI as a differentiator                                                                   |

Billing code lives in the repository behind a `BILLING_ENABLED` flag so self-hosters are never blocked by Stripe.

---

## 12. Local development and self-hosting

These are two different problems and conflating them is the common mistake.

|           | Local development                              | Self-hosting                                                              |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Mechanism | `supabase start` (the CLI orchestrates Docker) | A `docker-compose.yml` derived from the upstream Supabase self-host stack |
| Purpose   | The inner development loop                     | A deployment artifact for users                                           |
| Audience  | Maintainers and contributors                   | Operators running their own Kortex                                        |

### Local development uses the CLI

`supabase start` already runs the full stack in Docker. Replacing it with hand-rolled Compose gains nothing - you are not adding containerization, you are losing `db reset`, `migration new`, `gen types --local`, and seed handling, and taking on version-matching across a dozen service images by hand. Those CLI workflows are exactly what the migration and type-generation processes depend on.

```bash
npx supabase start        # full local stack
npx supabase db reset     # rebuild from migrations + seed
npm run db:diff <name>    # supabase/schemas/ -> a new migration
npx supabase db diff      # drift check; must print "No schema changes found"
npm run db:types          # regenerate lib/database.types.ts
```

### The rule that makes self-hosting possible

> **Every piece of state must be reproducible from `supabase/migrations/` plus `supabase/seed.sql`.**

No schema changes through the dashboard. No buckets created by clicking. No auth settings that exist only inside a hosted project. This is the single discipline that determines whether a self-host path can be written later; skip it and the Compose file becomes impossible to produce without archaeology. `supabase db reset` on a clean checkout producing a working application is the test, and it belongs in CI from early on.

The discipline matters from day one. The Compose file itself does not, and belongs late in the schedule (§14).

### Self-hosting and Storage

Supabase Storage separates two things: **metadata in Postgres** (`storage.objects`, `storage.buckets`, governed by RLS like everything else) and **bytes in a pluggable backend**.

The upstream self-host stack stores files on the local filesystem via a bind mount by default. S3-compatible backends - MinIO, RustFS, AWS S3, Cloudflare R2 - are opt-in through a Compose override that adds the backing service and points Storage at it with `STORAGE_BACKEND=s3` plus endpoint and credential variables.

What this means for Kortex:

- **MinIO is not needed for local development.** `supabase start` provides working Storage on the file backend. Adding MinIO to the dev loop costs a container and buys nothing.
- **Treat the backend as deployment configuration.** MinIO's community edition has entered maintenance mode and the upstream direction is backend agnosticism, with a RustFS override already available. Document `STORAGE_BACKEND` and its companions in `.env.example` and let operators choose. Never let a specific backend leak into application code.
- **Application code stays identical either way.** Kortex always calls `storage.from('attachments').createSignedUrl(path, ttl)`. It has no knowledge of what is underneath, and that property is worth protecting in review.
- **Two different S3 concepts.** The S3 _protocol endpoint_ at `/storage/v1/s3` lets tools like `rclone` talk to a Storage instance and works with any backend, including plain file storage. The S3 _backend_ is where bytes land. They are independent; people conflate them constantly.
- **macOS bind mounts are a known trap.** Docker Desktop bind mounts lack extended-attribute support and hit permission problems that can stop Storage working. Use a named Docker volume instead. Bake this into the self-host Compose from the start - it is the first issue Mac-using operators will report.

### Open-source packaging

- `supabase/migrations/` and `supabase/seed.sql`, so `supabase start && supabase db reset` gives a contributor a working local instance in two commands.
- `.env.example` documenting every variable, including the Storage backend switches.
- A `self-host/` directory containing the Compose stack, treated as a released artifact validated in CI - not something contributors touch daily.
- A documented managed path (Vercel plus hosted Supabase) alongside the self-host path.
- **License**: AGPL-3.0 to keep a cloud provider from reselling a hosted Kortex, or MIT/Apache-2.0 if adoption matters more than protection. Decide before the first public commit - relicensing after outside contributions arrive requires every contributor's consent.

---

## 13. Repository structure

```
kortex/
├── app/
│   ├── (marketing)/
│   ├── (auth)/
│   ├── (app)/w/[workspaceSlug]/pages/…
│   └── api/
│       ├── pages/reorder/route.ts
│       ├── collections/reorder/route.ts
│       ├── starred/reorder/route.ts
│       ├── uploads/sign/route.ts
│       └── stripe/webhook/route.ts
├── components/
│   ├── ui/                     shadcn primitives
│   ├── tree/                   sidebar tree and nodes
│   ├── editor/                 Tiptap, slash menu, image node
│   └── views/                  page view, collection view, tabs
├── lib/
│   ├── supabase/               browser / server / route clients
│   ├── queries/                typed PostgREST query builders
│   ├── rank/                   the only importer of @theyoungwolf/lexorank
│   ├── visibility.ts           isPublished / isHidden derivations
│   └── database.types.ts       generated - never hand-edited
├── supabase/
│   ├── schemas/                declarative SQL - the source of truth; NN_ prefixes are execution order
│   ├── migrations/             generated by db diff, then hand-corrected
│   ├── seed.sql                DML only: the three storage buckets
│   └── config.toml
├── self-host/
│   ├── docker-compose.yml
│   └── README.md
└── docs/
    ├── ARCHITECTURE.md          the design of record - this file
    └── LIB.md                   the lib/ layer: PostgREST, clients, cache contract
```

---

## 14. Open decisions

1. **Does "published" mean public on the internet?** As specified here it does not - every visibility check runs inside an authenticated, workspace-scoped query, so published means visible to other workspace members. Public share links are a plausible headline feature. If they are wanted, `pages.public_slug` plus a separate anonymous policy (`is_published_tree and public_slug is not null`) and a `/p/[slug]` route are the shape. **Decide before writing the RLS policies** - retrofitting an anonymous path through them is painful.

2. **Real-time collaborative editing.** Supabase Realtime plus Yjs is feasible but large, and Tiptap's collaboration extension expects a Yjs provider. Ship single-writer with the §9.4 conflict guard first, presence indicators second, CRDT collaboration only if users ask for it.

3. **Sidebar loading strategy.** Lazy per-node is specified. A single query returning a whole collection's pages, assembled into a tree client-side, feels snappier below roughly 500 pages and is trivial given `ancestor_ids`. Revisit if the lazy version feels sluggish.

4. **Where the rank operations live.** `lib/rank/` wraps `@theyoungwolf/lexorank`. The alternative is moving `first`, `between` with null handling, and `entropy` into the package itself and deleting the wrapper. The wrapper is the safer default while the package is still changing, since it gives somewhere to pin semantics without cutting a release.

5. **License.** See §12.

---

## 15. Build order

| Phase | Scope                                        | Done when                                                                                             |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0     | Schema, triggers, RLS, seed, type generation | `supabase start && supabase db reset` yields a working local DB; RLS verified with two distinct users |
| 1     | Auth, workspace creation, app shell          | Sign up lands in a workspace with an empty sidebar                                                    |
| 2     | Read paths, lazy tree                        | Sidebar renders the seeded tree; expansion paginates                                                  |
| 3     | CRUD and ordering                            | Create, rename, delete, drag-reorder within and across parents; order survives a refresh              |
| 4     | Editor                                       | Tiptap, slash menu, debounced autosave, save indicator                                                |
| 5     | Publish and visibility                       | Draft / Published / Hidden states correct; a second user sees exactly what they should                |
| 6     | Stars, views, attachments                    | Favourites reorder; reader avatars; image upload with signed URLs                                     |
| 7     | SaaS                                         | Invites, roles, Stripe, plan limits                                                                   |
| 8     | Self-host and launch                         | Compose stack, docs, license, CI, `CONTRIBUTING.md`                                                   |

**Phase 0 and Phase 5 deserve extra care.** Phase 3 will fail in confusing, intermittent ways if the collation or `NULLS NOT DISTINCT` details in §4 are wrong. Phase 5 is where a subtle trigger mistake leaks someone's drafts.
