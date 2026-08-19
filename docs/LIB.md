# Kortex - The `lib` layer

`ARCHITECTURE.md` is the design of record: it says what the system **is**. This document is the companion for `lib/`: it says how that design is **implemented in TypeScript**, and - more importantly - it records the Next.js, PostgREST and TanStack Query background knowledge that each decision rests on.

It exists because almost every file in `lib/` looks like unnecessary indirection until you know the one failure it prevents. Most of those failures are silent: no exception, no type error, just a flash of skeleton, a wrong badge, or one tenant's drafts rendered for another. Reading the code alone will not reveal them, because each individual file is correct in isolation. The bugs live in the _agreements between_ files.

Read `ARCHITECTURE.md` §4 (data model), §5 (authorization) and §6 (publish visibility) first. This document assumes them.

---

## 1. Map of the folder

`lib/` is a layered stack, not a bag of helpers. Each layer knows only about the one below it.

```
components/ and app/ routes
        ^
lib/types.ts            prop contracts - what components accept
        ^
lib/db/map.ts           the ONLY place a row becomes a prop
        ^
lib/queries/*           isomorphic query functions (take a Db, return prop shapes)
lib/queries/keys.ts     cache identity
lib/queries/loaders.ts  server-only, request-memoised wrappers
        ^
lib/db/selects.ts       PostgREST select strings - the wire contract
lib/db/types.ts         `Db` - the one client type the query layer speaks
        ^
lib/supabase/*          four client factories, one per execution context
        ^
lib/database.types.ts   generated from the database - ground truth
```

| File                        | Responsibility                                             | The failure it prevents                                                           |
| --------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `database.types.ts`         | Generated row, insert, update and relationship types       | Hand-written types drifting from the schema                                       |
| `supabase/client.ts`        | Browser client factory                                     | -                                                                                 |
| `supabase/server.ts`        | Server Component client factory, `cache()`d, `server-only` | Cross-request client sharing (tenant leak); `next/headers` in the browser bundle  |
| `supabase/route.ts`         | Route Handler client factory                               | Reaching for the service-role key in a user-facing handler                        |
| `supabase/proxy.ts`         | Session refresh and the signed-out redirect gate           | Expired access tokens; unauthenticated access to `/w/*`                           |
| `db/types.ts`               | `Db`, row aliases, `OwnerKind`                             | Query modules importing an environment-specific client                            |
| `db/selects.ts`             | Canonical select strings                                   | Server prefetch and client hook requesting different columns                      |
| `db/map.ts`                 | Row to prop mappers                                        | Raw rows reaching components; non-serialisable values breaking structural sharing |
| `types.ts`                  | Component prop contracts                                   | A column rename touching 40 components                                            |
| `queries/keys.ts`           | Query key construction                                     | Two spellings of one logical query becoming two cache entries                     |
| `queries/*.ts`              | Isomorphic reads                                           | Key or shape drift between server and client                                      |
| `queries/loaders.ts`        | Server-bound, request-memoised loaders                     | Duplicate queries per request; server imports leaking client-side                 |
| `query/get-query-client.ts` | QueryClient lifecycle                                      | A shared server cache serving one tenant's rows to another                        |
| `query/provider.tsx`        | Mounts the client cache                                    | Server dehydration and client cache being two different stores                    |
| `visibility.ts`             | The three publish states                                   | The tree icon, header chip and child list disagreeing                             |
| `format.ts`                 | Date labels                                                | Hydration mismatches from locale or timezone                                      |
| `slug.ts`                   | Slug preview                                               | -                                                                                 |
| `utils.ts`                  | `cn` taught the token vocabulary                           | tailwind-merge silently deleting custom-token classes                             |

---

## 2. What Supabase actually is

This is the unlock for most of the syntax in `lib/db/`.

**Supabase is not a database library.** It is a bundle of independent open-source servers in front of a plain Postgres database:

```
                 +-----------------------------------+
 browser  ---->  |  PostgREST      REST API over your tables
 or server       |  GoTrue         signup/login, issues JWTs
                 |  Storage        file uploads
                 |  Realtime       websockets
                 +-----------------+-----------------+
                                   v
                            plain Postgres
```

`supabase-js` is a thin HTTP client for those servers. When you write:

```ts
db.from("pages").select("id, title").eq("collection_id", x);
```

nothing database-shaped happens in JavaScript. The library builds a URL and does a `fetch`:

```http
GET /rest/v1/pages?select=id,title&collection_id=eq.<x>
Authorization: Bearer <the caller's JWT>
apikey: <publishable key>
```

That is the whole library. **`supabase-js` is a URL builder.** Once you hold that model, the strings in `lib/db/selects.ts` stop being mysterious: they are URL syntax, not JavaScript.

This is also why `ARCHITECTURE.md` §3.1 can call PostgREST the API surface rather than something we write. The read API is generated from the schema; `lib/queries/` only decides which URLs to build.

---

## 3. PostgREST select strings

Everything in this section is [PostgREST](https://postgrest.org) behaviour, not Supabase behaviour. PostgREST predates Supabase and is a separate project; Supabase ships it. The same syntax works against any PostgREST server.

All of these strings live in `lib/db/selects.ts`, for reasons that only become clear in §7: the server prefetch and the client hook must request **the same columns**, or the hydrated cache entry disagrees with what the hook expects, silently.

### 3.1 `select` is a query parameter

```ts
.select("id, title")            //  ?select=id,title
```

### 3.2 Nesting means "follow a foreign key"

PostgREST calls this **resource embedding**. A table name inside the select causes a join, resolved from the foreign key between the two tables:

```ts
db.from("pages").select("id, title, collections(name)");
```

```json
[{ "id": "...", "title": "Roadmap", "collections": { "name": "Product" } }]
```

Nothing configured that. PostgREST read `pages.collection_id references collections(id)` out of the catalog.

### 3.3 `alias:` renames the result key

```ts
.select("id, collection:collections(name)");
```

```json
[{ "id": "...", "collection": { "name": "Product" } }]
```

Cosmetic only. It changes the JSON key so the mapper reads `data.collection`.

### 3.4 `!hint` - disambiguation

This is the syntax that looks alien. It exists because of a real ambiguity in our schema. `public.pages` has **three** foreign keys into `public.profiles` (`supabase/schemas/06_pages.sql`):

```sql
collection_private_to uuid references public.profiles(id) on delete cascade,
created_by            uuid not null references public.profiles(id) on delete restrict,
last_edited_by        uuid references public.profiles(id) on delete set null,
```

So an unhinted embed is unanswerable:

```ts
.select("id, profiles(username)")
```

```json
{
  "code": "PGRST201",
  "message": "Could not embed because more than one relationship was found for 'pages' and 'profiles'"
}
```

Postgres auto-names foreign key constraints `<table>_<column>_fkey`, so the three are named `pages_collection_private_to_fkey`, `pages_created_by_fkey` and `pages_last_edited_by_fkey`. The `!` selects one of them:

```
author : profiles ! pages_created_by_fkey ( id, username )
`-----`  `------`   `--------------------`  `-----------`
 alias    table      which FK to join on      columns
```

Read aloud: _give me an `author` key, filled from `profiles`, joined via the `created_by` foreign key, selecting id and username._

The generated types are the reference for these names. `lib/database.types.ts` emits a `Relationships` array per table listing every `foreignKeyName`, which is exactly what you grep when writing a hint:

```ts
{ foreignKeyName: "pages_created_by_fkey",     columns: ["created_by"],     referencedRelation: "profiles" },
{ foreignKeyName: "pages_last_edited_by_fkey", columns: ["last_edited_by"], referencedRelation: "profiles" },
```

Hence the two embeds in `PAGE_DETAIL_SELECT`. Same table, different columns:

```ts
author:profiles!pages_created_by_fkey(id, username, display_name, full_name, avatar_path),
editor:profiles!pages_last_edited_by_fkey(id, username, display_name, full_name, avatar_path),
```

`lib/queries/members.ts` needs the same treatment, because `workspace_members` points at `profiles` twice (`user_id` and `invited_by`).

### 3.5 The self-referential case uses a column name instead

`pages.parent_id references pages(id)` is only **one** foreign key, so there is no question of _which_ FK. There is a different ambiguity: a self-join can be walked in two directions.

```
pages!parent_id
  downward: rows whose parent_id = my id     -> my children (many)
  upward:   the row whose id = my parent_id  -> my parent   (one)
```

The constraint name `pages_parent_id_fkey` names the _relationship_, which is identical in both directions, so it does not express which way you are walking. The **column** name does. This was established against the running database: the constraint-name hint fails with "no matches were found" (`PGRST200`) even though the constraint exists and is spelled correctly.

```ts
children:pages!parent_id(count)
```

**The rule, in two lines:**

| Ambiguity                                        | Hint with                  |
| ------------------------------------------------ | -------------------------- |
| Several foreign keys between the same two tables | the FK **constraint** name |
| Direction on a self-referential foreign key      | the **column** name        |

None of this is type-checked. A wrong hint is a 400 at runtime, not a compile error, which is why both rules are pinned in a comment at the top of `lib/db/selects.ts`.

### 3.6 `(count)` - the `has_children` column that does not exist

The sidebar needs a chevron, which means answering "does this page have children?" without fetching the children.

An embed may request an **aggregate** instead of columns:

```ts
children:pages!parent_id(count)
```

```json
{ "id": "p1", "title": "Roadmap", "children": [{ "count": 3 }] }
```

An array holding one object. `lib/db/map.ts` normalises that shape once:

```ts
type EmbeddedCount = { count: number }[] | null;
function hasAny(count: EmbeddedCount): boolean {
  return (count?.[0]?.count ?? 0) > 0;
}
```

Awkward shape, one line to absorb, zero extra round trips.

`TREE_COLLECTION_SELECT` does the same thing one level up with `pages(count)`, filtered to root pages, to decide whether a _collection_ gets a chevron.

### 3.7 Filtering inside an embed

A dotted path targets the embed alias rather than the top-level table:

```ts
.is("children.deleted_at", null)      //  &children.deleted_at=is.null
```

Two consequences worth stating:

- Soft-deleted children stop being counted, so a trashed page does not leave a phantom chevron behind.
- Because PostgREST runs the embed as a real SQL join, **RLS applies to the embedded rows too.** A teammate's draft child is not counted for someone who cannot see it, with no application code involved. This is `ARCHITECTURE.md` §5's "RLS is the only authorization layer" paying off in a place that is easy to miss.

### 3.8 `!inner`

An embed is a LEFT JOIN by default: parent rows come back even when the other side is empty. `!inner` makes it an INNER JOIN.

`STARRED_SELECT` uses it:

```ts
"rank, page:pages!inner(id, title, parent_id, collection_id, published_at, is_published_tree, updated_at)";
```

Without `!inner`, a star pointing at a page RLS hides returns `{ rank: "...", page: null }` - a row that exists only to be filtered out client-side. With it, the row does not come back at all.

### 3.9 `.single()` versus `.maybeSingle()`

PostgREST always returns an array. `.single()` sets a header asking for a bare object:

```http
Accept: application/vnd.pgrst.object+json
```

If the result is not exactly one row, PostgREST errors and `supabase-js` surfaces code `PGRST116`. `.maybeSingle()` issues the same request but treats zero rows as `data: null, error: null`.

**Under RLS, zero rows is the normal case, not an exception.** "This page does not exist" and "this page exists but you may not see it" are deliberately indistinguishable - leaking the difference would tell an attacker which ids are real. So an empty result is the answer to a legitimate 404, and `.single()` would convert every one of those into a thrown error hitting an error boundary.

Hence the blanket rule across `lib/queries/`: **`.maybeSingle()` everywhere, never `.single()`**, and `null` means `notFound()`.

`app/(app)/w/[workspaceSlug]/layout.tsx` states the corollary at the call site: `if (!workspace) notFound()` covers both "no such workspace" and "not a member of it", because 404 is the right answer to both.

---

## 4. Identity: RLS and the JWT

The `apikey` header carries the **publishable key**, which is public - it ships in the JavaScript bundle. It authenticates nobody. It identifies the project and maps the request to the Postgres role `anon`.

`Authorization: Bearer <jwt>` is what carries identity. When PostgREST receives a valid user token it switches the Postgres role to `authenticated` and stashes the token's claims in a session variable. `auth.uid()` is then just a function that reads that variable, roughly:

```sql
select (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid
```

So a policy like `pages_select` is Postgres itself filtering rows by the identity in the token. **No TypeScript decides what a viewer may see.** That is what `ARCHITECTURE.md` §5 means operationally.

Two things follow, and they are the reason `lib/supabase/` is shaped the way it is:

1. **Every client that serves a user request must be built from that user's cookies**, so the JWT rides along and the policies fire.
2. **The service-role key maps to a role that bypasses RLS entirely.** Every policy is skipped. Correct for a migration or an admin script; catastrophic in a request handler, where it turns a missing ownership check into an IDOR that returns any page in any workspace. `lib/supabase/route.ts` exists partly to keep that temptation out of `server.ts`.

---

## 5. Client factories

### 5.1 What a factory is

A factory is **a function that returns a configured object**, as opposed to a pre-made object. No more than that.

```ts
// Not a factory: one object, built at import time, shared by every importer.
export const db = createClient(url, key);

// A factory: a fresh, configured object per call.
export function createClient() {
  return createBrowserClient<Database>(url, key);
}
```

### 5.2 Why the module-level constant is a tenant leak on the server

Suppose `lib/supabase/server.ts` were written the obvious way:

```ts
const cookieStore = await cookies();
export const db = createServerClient(url, key, { cookies: { ...cookieStore } });
```

Node handles many concurrent requests in one process, and a module-level `const` is evaluated **once, on first import**. Every request afterwards shares that object:

```
t=0   Alice's request arrives -> module loads -> client built with ALICE's cookies
t=1   Bob's request arrives   -> module already loaded -> reuses ALICE's client
t=2   Bob's page renders Alice's private drafts
```

No exception. No type error. It behaves perfectly in development with one signed-in user and leaks tenant data under concurrency. This is the most common way an RSC-plus-Supabase application leaks, and nothing in the type system can catch it.

So the client must be built per request. Hence a factory.

### 5.3 React `cache()` - per-request memoisation

A naive factory would build a client at every call site. `lib/supabase/server.ts` wraps it:

```ts
export const createClient = cache(async () => { ... });
```

`cache()` memoises for the duration of **one server request**, with no sharing between requests:

```
Request A: layout           -> builds client #1
           route pane       -> returns client #1   (memo hit)
           generateMetadata -> returns client #1   (memo hit)
Request B: anything         -> builds client #2    (fresh memo)
```

Singleton-like efficiency inside a request, hard isolation between requests. That is exactly the property RLS requires. The same reasoning is applied to `getQueryClient()` in §7.9 and to the loaders in §6.3.

### 5.4 Why there are four clients

This looks like duplication of one nine-line function. It is not. There are four genuinely different runtimes with four different answers to _"may I write a cookie right now?"_

The background: a Supabase access token is short-lived (about an hour by default). `supabase-js` silently exchanges the refresh token for a new pair when needed, and must then **write the new tokens back into cookies** or the browser keeps sending the dead one. The `cookies: { getAll, setAll }` config tells it where cookies live.

| Runtime                   | File        | Can it write cookies?                                                                  | So `setAll` is                       |
| ------------------------- | ----------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| Browser                   | `client.ts` | Yes, `document.cookie`                                                                 | Handled internally; no config needed |
| Server Component / Action | `server.ts` | **No** during render - Next.js makes `cookies()` read-only once the response has begun | Attempts it, `try/catch`es the throw |
| Route Handler             | `route.ts`  | Only by attaching to the `Response` it returns, which the factory does not own         | **A no-op**                          |
| Proxy                     | `proxy.ts`  | Yes - it owns both the request and the response                                        | Actually writes them                 |

Read down the right-hand column and the load-bearing consequence appears: **three of the four cannot refresh a token, so the proxy is the only thing keeping sessions alive.**

### 5.5 The proxy matcher rule

Because of that, the matcher in the repo-root `proxy.ts` must keep covering `/api/*`:

```ts
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

Narrow it to exclude `/api` as an "optimisation" and Route Handlers keep sending an expiring token. After roughly an hour of an open tab you get intermittent 401s that disappear on reload, with nothing to point at. This is why the warning sits at the top of `lib/supabase/proxy.ts`.

`updateSession` also owns the signed-out redirect gate:

```ts
const publicPaths = ["/", "/login", "/sign-up", "/check-email", "/error", "/auth"];
```

`/new-workspace` is deliberately absent: it is onboarding step 2, operating on the workspace the signup trigger already created, so it needs the session step 1 issued.

Two naming notes. Next.js has renamed middleware to **proxy**: the repo root holds `proxy.ts` exporting `proxy()`, which is why `lib/supabase/middleware.ts` was deleted. And the `hasEnvVars` guard in `lib/utils.ts` is leftover starter scaffolding; while it stays, a missing env var makes this gate fail **open**.

---

## 6. The isomorphic query layer

### 6.1 What "isomorphic" means

**Isomorphic** (also _universal_) code is code where **the same source file runs in two different environments** - here Node during server rendering, and the browser.

That is harder than it sounds, because the environments have different capabilities. `next/headers` exists only on the server; `document` only in the browser. Import one into code that runs in both and the bundler either fails or ships server code to the client.

### 6.2 Dependency injection through `Db`

Not isomorphic:

```ts
// lib/queries/pages.ts
import { createClient } from "@/lib/supabase/server"; // pulls in next/headers

export async function listSiblings(collectionId: string, parentId: string | null) {
  const db = await createClient();
  return db.from("pages").select(TREE_PAGE_SELECT);
}
```

This file can now only run on the server. A Client Component importing anything from it drags `next/headers` into the browser bundle.

Isomorphic - take the client as a parameter:

```ts
// lib/queries/pages.ts - imports nothing environment-specific
export async function listSiblings(db: Db, collectionId: string, parentId: string | null) {
  return db.from("pages").select(TREE_PAGE_SELECT);
}
```

The caller now supplies its own environment:

```ts
// server: app/(app)/w/[workspaceSlug]/layout.tsx
const db = await createClient(); // lib/supabase/server
queryClient.prefetchQuery(collectionsOptions(db, workspace.id, "personal"));

// client: components/tree/sidebar-tree-container.tsx
const db = React.useMemo(() => browserDb(), []); // lib/supabase/client
useSuspenseQuery(collectionsOptions(db, workspaceId, "personal"));
```

Same function, same file, two runtimes. That is the entire purpose of the one-line alias in `lib/db/types.ts`:

```ts
export type Db = SupabaseClient<Database>;
```

It is the injection socket. `browserDb` in `lib/supabase/client.ts` is an alias of `createClient` for the same reason: at a query call site you want to read "give me the browser db", not "construct a client".

The payoff is not code reuse for its own sake. It is that server and client fill **one shared cache**, and any divergence between them fails silently (§7).

### 6.3 `loaders.ts` - quarantining the impure half

Server code still wants convenience rather than building a `db` at every call site. Those wrappers live in their own module, `lib/queries/loaders.ts`:

```ts
import "server-only";

export const loadPageView = cache(async (pageId: string, basePath: string) => {
  const db = await createClient();
  return getPageView(db, pageId, basePath); // the isomorphic function
});
```

`cache()` again, so a layout, a route pane and `generateMetadata` asking for the same workspace produce one query.

### 6.4 `server-only` - the tripwire

`server-only` is a package whose entire job is to **fail the build** when it reaches a client bundle. It is not a runtime feature.

It is here because of a real failure, not a hypothetical one. `components/tree/sidebar-tree-container.tsx` is `"use client"` and imports `siblingsOptions` from `lib/queries/pages.ts`. When a `cache()`d loader lived in that _same_ file, the route broke with an opaque bundler error about `next/headers`. `server-only` at the top of both `loaders.ts` and `supabase/server.ts` converts any repeat of that mistake into a build error naming the file.

**The rule: nothing in `lib/queries/` may import `lib/supabase/server` except `loaders.ts`.**

---

## 7. The cache: keys, dehydration, hydration

### 7.1 The constraint that creates this whole layer

Recap of the boundary, since everything here depends on it:

- A **Server Component** (the default) runs on the server, once per request, may `await` a database, and its JavaScript is never sent to the browser - only its rendered output.
- A **Client Component** (`"use client"`) has its JavaScript shipped to the browser. It may hold state and handle events. It renders once on the server for the initial HTML, then again in the browser.

Kortex splits them as `ARCHITECTURE.md` §9 prescribes: panes are Server Components, the sidebar tree is a Client Component, because it owns expansion state and drag-and-drop.

Which creates the problem: **the sidebar needs data but cannot `await` the database.** Done naively it mounts empty, fetches in an effect, and pops in - a visible flash on every load, and a request the server could have made sooner. TanStack Query's dehydrate/hydrate pair is what removes that flash, and `lib/query/` is the plumbing for it.

### 7.2 The dance

```
SERVER                                             CLIENT
1. build a QueryClient
2. prefetchQuery(key K, fn F)   --+
3. dehydrate() -> plain JSON      |
4. stream HTML with that JSON     |
                                  +--> 5. <HydrationBoundary state={...}>
                                            inserts the JSON under key K
                                       6. useQuery(key K, fn F)
                                            cache hit -> renders, no fetch
```

`dehydrate()` serialises the cache to JSON. `<HydrationBoundary>` inserts that JSON into the browser's cache before anything renders.

The whole mechanism is keyed by a **string**. Nothing verifies that step 2 and step 6 agree.

### 7.3 A document cache, not a normalized one

This matters more here than in a typical app, and it is the opposite of Apollo, which the previous Go/Mantine implementation used.

Apollo **normalizes**: it recognises `Page:abc123` as an entity, stores it once, and updating it anywhere updates every query that mentions it.

TanStack Query does none of that. It is `Map<serialisedKey, whateverYourFunctionReturned>`. There is no entity identity, so **a key _is_ the identity**:

```ts
["pages", "col-1", "root"][("pages", "col-1", null)]; // one entry // a completely separate, independent entry
```

Two copies of the same rows, and writing one does not touch the other. Two rules follow, and both are load-bearing:

1. **Keys are hierarchical**, so prefix invalidation works: `invalidateQueries({ queryKey: ["pages", collectionId] })` reaches every parent bucket in that collection at once.
2. **One logical query has exactly one spelling.** Hence `lib/queries/keys.ts` is the only file allowed to build a key.

### 7.4 Failure mode: key drift

```ts
// server
queryClient.prefetchQuery({ queryKey: ["pages", collectionId], ... });
// client
useQuery({ queryKey: ["pages", collectionId, parentId ?? "root"], ... });
```

Result: a cache **miss**. No error, no warning. The client refetches everything the server already paid for. You see a flash of skeleton, conclude that server rendering "is not helping much", and never find it by reading either file - because each file is individually correct.

The structural fix is that both sides call the **same options factory**, so disagreement is impossible:

```ts
export function siblingsOptions(db: Db, collectionId: string, parentId: string | null) {
  return queryOptions({
    queryKey: keys.siblings(collectionId, parentId), // one definition
    queryFn: () => listSiblings(db, collectionId, parentId),
  });
}
```

Only `db` differs between the two callers. That is the payoff of §6.

### 7.5 Failure mode: shape drift

Same key, different columns:

```
server select: "id, title, rank"
client select: "id, title, rank, published_at"
```

The client gets a cache **hit**, renders with `publishedAt === undefined`, and every publish badge is quietly wrong until a background refetch lands. Hence one select string in `lib/db/selects.ts`, imported by both sides.

### 7.6 Why the sibling key must match the rank uniqueness scope

```ts
siblings: (collectionId, parentId) => ["pages", collectionId, parentId ?? "root"] as const,
```

This must mirror `pages_sibling_rank_key (collection_id, parent_id, rank)` from `supabase/schemas/06_pages.sql` exactly. Concretely, if `parentId` were dropped from the key:

1. Collection C's root pages and page P's children would share **one cache entry**.
2. You drag a child under P. `onMutate` optimistically rewrites that entry.
3. The roots list - a different list, with different ranks - gets stomped.
4. Rows visibly jump into the wrong branch and snap back when `onSettled` refetches.

**The cache key must partition data the same way the database partitions uniqueness.** Otherwise optimistic updates cross-contaminate. The same reasoning applies to `collections` (`workspace_id, private_to`) and `starred` (`user_id`); see `ARCHITECTURE.md` §7.1 for the three scopes.

### 7.7 The `?? "root"` versus `.is(..., null)` asymmetry

One concept, two spellings, because two systems have different rules about null:

```ts
["pages", collectionId, parentId ?? "root"] // key: null is not a usable segment
  .is("parent_id", null); // PostgREST: null needs `is`; `eq` rejects it
```

They are three characters apart and mean the same thing. The PostgREST half is wrapped once in `lib/queries/pages.ts`:

```ts
function scopeToParent<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
  query: T,
  parentId: string | null,
): T {
  return parentId === null ? query.is("parent_id", null) : query.eq("parent_id", parentId);
}
```

The reorder handlers in `app/api/*/reorder/` will need this same helper; it is generic over the builder so it can be reused rather than re-derived.

### 7.8 The un-awaited prefetch

`app/(app)/w/[workspaceSlug]/layout.tsx` prefetches without awaiting:

```ts
void queryClient.prefetchQuery(collectionsOptions(db, workspace.id, "personal"));
void queryClient.prefetchQuery(collectionsOptions(db, workspace.id, "workspace"));
void queryClient.prefetchQuery(starredOptions(db, actor.id));

return <HydrationBoundary state={dehydrate(queryClient)}>...
```

So the queries are still `pending` when `dehydrate()` runs - and TanStack's default dehydration **drops pending queries**, which would mean all three refetch on the client. The override in `lib/query/get-query-client.ts` is what makes the pattern work:

```ts
dehydrate: {
  shouldDehydrateQuery: (query) =>
    defaultShouldDehydrateQuery(query) || query.state.status === "pending",
},
```

Now they are serialised **in flight**. React streams the HTML immediately, the queries resolve, and their results stream down into the already-mounted client cache. Net effect: **the shell paints before the data is ready, and the client never issues its own request.** Awaiting instead would block the whole sidebar render on the slowest of the three.

This pairs with the shape of the layout, which is worth reading as one idea:

```tsx
export default function WorkspaceLayout({ children, params }: LayoutProps<"/w/[workspaceSlug]">) {
  return (
    <AppShell
      sidebar={
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarPane params={params} />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
```

The layout never awaits `params`. Under Cache Components, touching `params`, cookies or a database **in a component's own body** makes the whole route unprerenderable, so every dynamic access is pushed beneath the Suspense boundary and the two-pane frame stays static. That is also why `lib/supabase/server.ts` carries the warning that it may only be called beneath a `<Suspense>` boundary: it reads cookies, so it makes its caller dynamic.

### 7.9 One QueryClient per request, one per browser tab

```ts
const getServerQueryClient = cache(makeQueryClient);
let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) return getServerQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}
```

**The `isServer` branch is a security control, not a performance detail** - the same argument as §5.2. A module-level QueryClient on the server would be shared across concurrent requests, and every row in it arrived through RLS under one specific user's JWT. Nothing type-level prevents it; it would simply start serving one tenant's tree to another under load.

The server branch is `cache()`d rather than constructed fresh per call site so that a layout and the route beneath it prefetch into the **same** client, and a list both need is fetched once. The cost is that each `dehydrate()` serialises everything accumulated so far, so duplicated entries across two `<HydrationBoundary>`s get merged on the client by `dataUpdatedAt`. That is a bytes cost only, but it is the reason to keep boundaries few and high in the tree.

`lib/query/provider.tsx` then uses `getQueryClient()` rather than the more familiar `useState(() => new QueryClient())`, because the same accessor has to serve the server prefetch and the provider. Two accessors would be two stores, and the dehydrated state would land in the wrong one.

Defaults worth knowing: `staleTime: 30_000` stops a client-side navigation from immediately refetching what the server just streamed; `retry: 1` keeps a failing query from hammering PostgREST.

### 7.10 Two hook styles, on purpose

`components/tree/sidebar-tree-container.tsx` mixes them, and the reason is a constraint rather than a preference:

- **Collections and stars use `useSuspenseQuery`.** The layout prefetched them, so data is present on first paint and `data` is always defined - no `undefined` branch in the render. The layout's `<Suspense fallback={<SidebarSkeleton />}>` covers them.
- **Page levels use `useQuery` via `useQueries`.** `useSuspenseQuery` has no `enabled` option, and levels must stay lazy. A page tree is unbounded in depth, so eagerly fetching one is the single thing the tree design forbids (`ARCHITECTURE.md` §9.2).

Expansion is stored as `Map<nodeId, { collectionId, parentId }>` rather than a `Set<nodeId>`, because a query key needs both halves of the sibling scope. A collection's children are its root pages (`parentId: null`); a page's children need that page's `collection_id`. Resolving that later would mean searching data that has not loaded yet, so the scope is captured at the moment of the click, while the row is in hand.

---

## 8. Row to prop: the mapping layer

### 8.1 Why map at all

`lib/db/map.ts` is the only place a PostgREST row may become something a component sees, and `lib/types.ts` is the only vocabulary components know. Two rules hold this layer together.

**No raw row escapes.** Components depend on `lib/types.ts`, not on `Tables<>`. Rename a column tomorrow, run `npm run db:types`, and `tsc` points at one file instead of at forty components. That only works because every mapper takes a `Pick` of the generated row type rather than an inline structural shape:

```ts
export function toActorRef(
  row: Pick<Tables<"profiles">, "id" | "username" | "display_name" | "full_name"> &
    Partial<Pick<Tables<"profiles">, "avatar_path">>,
): ActorRef;
```

An inline `{ id: string; username: string }` would compile happily after the rename and produce a runtime `undefined` in the UI.

**Everything out of here is plain JSON with ISO strings.** This one is not stylistic. TanStack Query does **structural sharing**: on refetch it deep-compares the old and new results and reuses the previous object references for anything unchanged, so React's `===` checks skip re-rendering those rows. Put a `Date`, a `Map`, or a class instance in there and the comparison cannot do its job; every refetch produces all-new references and the entire tree re-renders. Nothing errors. It just gets slow, and the cause is invisible.

The same property is what lets these shapes cross the server/client boundary as props at all.

### 8.2 Derived, not stored

Three things are computed here rather than kept in the database:

- **`initials`** - precomputed so components never slice names.
- **`tone`** - the avatar ground, hashed from the id (`sum of char codes % 2`) so a given person keeps the same colour on every machine and across reloads, without a column.
- **`ownerKind`** - `ownerKindOf(privateTo)`. Ownership is the _nullability_ of `collections.private_to`; there is no `owner_kind` column and no `owner_member_id` (`ARCHITECTURE.md` §4.1). Null means the collection belongs to the workspace; non-null means it is personal to that profile.

`toActorRef` also encodes a small authorization fact: the display-name fallback chain is `display_name ?? full_name ?? username`, never the email. `username` is `NOT NULL` so the chain always terminates, and RLS does not expose other people's email addresses anyway. `ActorRef.email` is populated only for the signed-in user, and sourced from `auth.getUser()` rather than from `profiles`.

### 8.3 The two meanings of "depth"

There are two depths in this system and conflating them is a live hazard:

| Name             | Meaning                                           | Root page value |
| ---------------- | ------------------------------------------------- | --------------- |
| `pages.depth`    | Generated column, `array_length(ancestor_ids, 1)` | `0`             |
| `TreeItem.depth` | **Visual** sidebar depth                          | `1`             |

They differ by one, because a collection occupies level 0 of the sidebar. `PageNodeData` therefore deliberately carries **neither** - holding both under one name is exactly how they get swapped - and visual depth exists only on `TreeItem`, applied by `toPageTreeItem(page, visualDepth)` and by `flatten()` in the tree container:

```ts
for (const collection of collections) {
  out.push(toCollectionTreeItem(collection)); // depth 0
  if (expandedIds.has(collection.id)) pushPages(childrenByParent.get(collection.id) ?? [], 1);
}
```

`flatten()` also explains why `TreeItem` is a flat discriminated union rather than a nested tree: a flat ordered array is what a `(collection_id, parent_id, rank)` query returns, it keeps dnd-kit's logic working on indices, and it serialises across the server/client boundary without a recursive type. Ordering comes from the server's `rank`; nothing is sorted in the client.

---

## 9. The leaf modules

### 9.1 `visibility.ts`

The three publish states, derived in exactly one place:

```ts
export function publishState(p: PublishStateInput): PublishState {
  if (!p.publishedAt) return "draft";
  return p.isPublishedTree ? "published" : "hidden";
}
```

`is_published_tree` is maintained by the `pages_tree_sync` trigger (`ARCHITECTURE.md` §6), so the three states are a pure function of two columns. **Hidden** means the page is published itself but an ancestor is not, so nobody but the author can reach it.

Never recompute this inline: the tree icon, the header chip and the child-page list must always agree. `PublishStateInput` is deliberately a two-field interface that `PageNodeData` and `ChildPageRow` both extend, so any shape carrying those two columns works with the function without adapters.

`getPageView` uses the same pair to find `blockingAncestor` - the nearest unpublished ancestor, which is what the Hidden banner names and offers to publish:

```ts
blockingAncestor: node.publishedAt && !node.isPublishedTree ? findBlocker(ancestors) : undefined,
```

### 9.2 `format.ts`

Locale-fixed to `en-GB` and `timeZone: "UTC"` **on purpose**. These strings are produced during a server render and compared against a client render during hydration; anything that varies by timezone or locale mismatches and React re-renders it. `profiles.timezone` and `profiles.locale` exist to do this properly once copy moves to `next-intl`.

`formatRelative` is not reactive: a page left open overnight keeps yesterday's wording until something re-renders it. That is the accepted trade for not shipping a ticking client component into every row.

### 9.3 `slug.ts`

A **deliberate duplicate** of `public.generate_workspace_slug` (`supabase/schemas/04_workspaces.sql`), existing only so the onboarding form can preview a slug as the user types. The database stays authoritative: it re-derives the slug and appends an entropy suffix on collision, so the value `rename_workspace` returns can legitimately differ from the preview. **Always navigate to the slug the RPC returns.** The rules are duplicated, not shared; keep the two in step.

### 9.4 `utils.ts` - `cn` and the tailwind-merge trap

This one is subtle and cost real time. tailwind-merge decides which of two conflicting classes wins by assigning each to a class group, and it derives those groups from Tailwind's **default** scale. Kortex replaces most of that scale with role names, and tailwind-merge cannot tell a role name from a colour name: given `text-item text-primary-foreground` it reads **both** as text colours, keeps the last, and silently deletes the other.

The observed symptom before the config existed: every primary button rendered with `text-primary-foreground` stripped - dark body ink on a blue fill - and every `Input` lost its `text-item` size. Invisible in review, because the source string looks correct and only the merged output is wrong.

So every custom token whose prefix collides with a Tailwind class group is registered:

```ts
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
      "font-weight": [{ font: [...FONT_WEIGHTS] }],
      leading: [{ leading: [...LEADINGS] }],
      tracking: [{ tracking: [...TRACKINGS] }],
      rounded: [{ rounded: [...RADII] }],
      shadow: [{ shadow: [...SHADOWS] }],
      duration: [{ duration: [...DURATIONS] }],
      ease: [{ ease: [...EASINGS] }],
    },
  },
});
```

**Rule: adding a token to `app/globals.css` means adding it to the matching list in `lib/utils.ts`.**

---

## 10. A request, end to end

Following `GET /w/acme/p/abc123` through every layer is the fastest way to see the pieces cooperate.

**1. Proxy.** Repo-root `proxy.ts` calls `updateSession` (`lib/supabase/proxy.ts`). It builds the one client that _can_ write cookies, calls `getClaims()` - which refreshes the token if it is near expiry and writes the new cookies onto the response - and checks the path against `publicPaths`. `/w/acme/p/abc123` is not public, a session exists, so it passes through.

**2. Static shell.** `WorkspaceLayout` renders `<AppShell>` with `<Suspense fallback={<SidebarSkeleton />}>` around the sidebar, and never awaits `params`. The two-pane frame is static HTML and paints immediately (§7.8).

**3. Loaders.** Inside the boundary, `SidebarPane` awaits `params` and calls `loadWorkspace("acme")` and `loadActor()` in parallel. Each is a `cache()` miss on this request, builds a `db`, and runs an isomorphic query:

```http
GET /rest/v1/workspaces?select=id,name,slug,icon,is_personal&slug=eq.acme&deleted_at=is.null
```

RLS filters it. `.maybeSingle()` returns `null` for both "no such workspace" and "not a member", and `notFound()` is the right answer to both (§3.9).

**4. Prefetch.** Three un-awaited `prefetchQuery` calls into the request-scoped `getQueryClient()`. `dehydrate()` captures them while still pending, thanks to `shouldDehydrateQuery` (§7.8).

**5. Client adoption.** `SidebarTreeContainer` calls the **identical** `collectionsOptions` and `starredOptions` factories with a browser `db`. Keys and shapes match by construction, so `useSuspenseQuery` resolves from hydrated state with no network request (§7.4).

**6. Lazy expansion.** You expand a collection. `expanded` gains `{ collectionId, parentId: null }`, `useQueries` adds `siblingsOptions(db, cid, null)`, and now a real browser fetch happens:

```http
GET /rest/v1/pages?select=id,title,parent_id,collection_id,rank,published_at,
    is_published_tree,updated_at,children:pages!parent_id(count)
    &collection_id=eq.<cid>&parent_id=is.null
    &deleted_at=is.null&children.deleted_at=is.null&order=rank.asc
```

Three things from earlier sections are visible in that one URL: `children:pages!parent_id(count)` is the synthesised `has_children` (§3.5, §3.6, §3.7), `parent_id=is.null` is `scopeToParent` handling the root case (§7.7), and `order=rank.asc` is the lexorank ordering that only sorts correctly because the column is `text collate "C"` (`ARCHITECTURE.md` §4.2).

**7. Mapping.** `toPageNodeData` collapses `children: [{ count: 3 }]` into `hasChildren: true`, converts snake_case to camelCase, and returns plain JSON with ISO strings so structural sharing keeps working (§8.1).

**8. The page pane, in parallel.** `getPageView` fires `PAGE_DETAIL_SELECT` - one request pulling author, editor, collection, view count, readers, stars and child count through embeds. It then reads `ancestor_ids` (the `uuid[]` the tree trigger maintains in root-first order) and issues **one** `.in()` query for the entire breadcrumb, with no recursion:

```ts
const ancestors = await getAncestors(db, data.ancestor_ids);
```

`.in()` does not preserve order, so `getAncestors` re-indexes against the original array rather than sorting it. `publishState` then turns `(published_at, is_published_tree)` into `draft | published | hidden`, and `findBlocker` locates the Hidden banner's subject.

**9. Render.** Components receive only `lib/types.ts` shapes. Not one of them has ever seen a PostgREST row.

---

## 11. Invariants for `lib/`

These complement the database invariants in `CLAUDE.md`. Each one, if broken, produces a silent failure rather than an error.

1. **Nothing in `lib/queries/` imports `lib/supabase/server`** except `loaders.ts`. `server-only` enforces it at build time (§6.4).
2. **Every function in `lib/queries/` takes `Db` as its first argument.** No query function constructs a client (§6.2).
3. **Both sides of the boundary call the same `xOptions()` factory.** Never hand-write a `queryKey` at a call site (§7.4).
4. **`lib/queries/keys.ts` is the only file that builds a query key**, and `siblings` mirrors `pages_sibling_rank_key (collection_id, parent_id, rank)` exactly (§7.6).
5. **Select strings live in `lib/db/selects.ts`.** A widened select is a one-line change both sides pick up (§7.5).
6. **`.maybeSingle()` everywhere, never `.single()`.** Null means `notFound()` (§3.9).
7. **Every mapper input is a `Pick<Tables<...>>`**, never an inline structural shape (§8.1).
8. **Everything leaving `lib/db/map.ts` is plain JSON with ISO strings.** No `Date`, `Map`, or class instances (§8.1).
9. **Server-side clients are per-request.** `cache()`, never a module-level constant - for the Supabase client and the QueryClient alike (§5.2, §7.9).
10. **No `SUPABASE_SERVICE_ROLE_KEY` in anything serving a user request** (§4).
11. **The proxy matcher keeps covering `/api/*`** (§5.5).
12. **Publish state comes from `publishState()`.** Never recompute the two-column rule inline (§9.1).
13. **Visual depth and `pages.depth` stay distinct.** `PageNodeData` carries neither (§8.3).
14. **A new token in `app/globals.css` gets registered in `lib/utils.ts`** (§9.4).

---

## 12. Not built yet

Things `ARCHITECTURE.md` and `CLAUDE.md` describe that `lib/` does not yet contain:

- **`lib/rank/`.** The `@theyoungwolf/lexorank` wrapper (`ARCHITECTURE.md` §7.3) does not exist. `onReorder` in `components/tree/sidebar-tree-container.tsx` is intentionally inert, because the `23505` collision retry must not live in a tab that can close mid-flight. Reorder belongs in `app/api/*/reorder/route.ts`, which will build its client with `createRouteClient` and reuse `scopeToParent` (§7.7).
- **Zod schemas.** No mutation Route Handlers exist yet, so nothing is validating request bodies. When they arrive, every one validates before touching the database.
- **`next-intl`.** Copy is still hardcoded (the tree container's `emptyPrompt`, `publishStateLabel`), and `lib/format.ts` is the stopgap for dates.
- **Mutation hooks.** The optimistic `onMutate` / `onError` / `onSettled` pattern in `ARCHITECTURE.md` §9.2 has no implementation in `lib/` yet. It will depend on §7.6 being correct.
- **`hasEnvVars` in `lib/utils.ts`** is leftover Supabase-starter scaffolding, still consumed by `lib/supabase/proxy.ts`, where it makes the auth gate fail **open** if env vars go missing. Remove it once env configuration is settled.
