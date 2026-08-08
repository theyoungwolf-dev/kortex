<div align="center">

<!-- HERO: replace with docs/assets/logo.svg once designed -->
<!-- <img src="docs/assets/logo.svg" alt="Kortex" width="120" /> -->

# Kortex

**An open-source knowledge base for teams who think in trees.**

Collections of nested pages, drag-to-reorder everywhere, and publishing that respects hierarchy - so a draft parent keeps its children private until you're ready.

<!-- BADGES: add once CI and license are set up -->
<!-- ![CI](https://github.com/theyoungwolf-dev/kortex/actions/workflows/ci.yml/badge.svg) -->
<!-- ![License](https://img.shields.io/badge/license-TBD-lightgrey) -->

<!-- HERO POSTER: replace with docs/assets/hero.png -->
<!-- ![Kortex](docs/assets/hero.png) -->

</div>

---

> [!WARNING]
> **Kortex is in early development.** The schema is still moving, there is no upgrade path between commits yet, and it is not ready for production data. Star the repo if you want to know when that changes.

---

## What is Kortex?

Kortex organises knowledge the way people actually structure it: as nested documents inside named collections, not a flat list with tags bolted on.

Three things shape the design:

**Publishing follows the tree.** A page is only visible to your teammates when it _and every page above it_ has been published. Draft a whole section privately, then publish the parent to reveal it all at once. A published page under a draft parent shows as **Hidden** - it exists, it's published, and nobody can reach it yet.

**Everything is ordered, and the order is yours.** Collections, pages, sub-pages, and each person's favourites all keep an explicit order you set by dragging. Reordering is a single-row write, so it stays fast whether you have twelve pages or twelve thousand.

**Your data is Postgres.** No proprietary storage layer. Every access rule is a row-level security policy you can read, and the whole thing runs on your own machine with two commands.

<!-- SCREENSHOT: full app view -->
<!-- ![Page view](docs/assets/screenshot-page.png) -->

## Features

- **Nested pages** - unbounded depth, with lazy loading so a large tree stays responsive
- **Rich-text editor** - Tiptap with a slash-command menu, images, and autosave
- **Hierarchical publishing** - draft, published, and hidden states derived from the whole ancestor chain
- **Drag to reorder** - within a list or across parents, with optimistic UI
- **Personal favourites** - each person keeps their own ordered list
- **Read analytics** - see who has read a page and when
- **Workspaces** - personal and shared collections inside a tenant boundary
- **Trash** - soft deletes, reversible for 30 days
- **Self-hostable** - Postgres, an object store, and a Next.js app

<!-- SCREENSHOT: editor with slash menu open -->
<!-- ![Editor](docs/assets/screenshot-editor.png) -->

## Tech stack

|                 |                                                                                  |
| --------------- | -------------------------------------------------------------------------------- |
| Framework       | Next.js (App Router), TypeScript                                                 |
| UI              | Tailwind CSS, shadcn/ui                                                          |
| Database & auth | Supabase (Postgres, RLS, Auth, Storage)                                          |
| Data access     | `supabase-js` over PostgREST                                                     |
| Schema          | Drizzle, generating SQL migrations                                               |
| Client state    | TanStack Query                                                                   |
| Editor          | Tiptap                                                                           |
| Drag & drop     | dnd-kit                                                                          |
| Ordering        | [`@theyoungwolf/lexorank`](https://www.npmjs.com/package/@theyoungwolf/lexorank) |

Authorization lives entirely in Postgres row-level security. There is no application-layer permission check to keep in sync, and no ORM at runtime.

## Quick start

**Prerequisites**

- Node.js 20+
- Docker (running) - the local Supabase stack needs it
- The [Supabase CLI](https://supabase.com/docs/guides/local-development)

**Setup**

```bash
git clone https://github.com/theyoungwolf-dev/kortex.git
cd kortex
npm install

# Start Postgres, Auth, Storage, and Studio locally
npx supabase start

# Apply migrations and seed data
npx supabase db reset

cp .env.example .env.local
```

`supabase start` prints an API URL and an anon key. Put them in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
```

Then:

```bash
npm run dev
```

Kortex is at http://localhost:3000, and Supabase Studio at http://localhost:54323.

> The seed creates a demo workspace with a sample collection. Sign in with any email - local Auth accepts it, and messages are captured by the built-in Inbucket at http://localhost:54324 rather than sent.

## Commands

```bash
npm run dev            # dev server
npm run build          # production build
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run test           # vitest

npx supabase start     # start the local stack
npx supabase stop      # stop it
npx supabase db reset  # rebuild the database from migrations + seed
npm run db:generate    # generate a migration from drizzle/schema.ts
npm run db:types       # regenerate lib/database.types.ts
```

After changing the schema, always run `npm run db:types` followed by `npm run typecheck`. A migration isn't finished until both pass.

## Project structure

```
app/                 routes and Route Handlers
components/          UI, sidebar tree, editor, views
lib/
  supabase/          browser, server, and route clients
  queries/           typed query builders
  rank/              ordering - the only importer of the lexorank package
  database.types.ts  generated; never edited by hand
drizzle/schema.ts    schema source of truth
supabase/
  migrations/        the SQL that actually ships
  seed.sql           demo data
docs/ARCHITECTURE.md the design of record
```

## Architecture

Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** before opening a pull request that touches the database, ordering, or permissions. It covers the data model, the RLS policies, and the two subsystems that carry real risk.

Three specifics catch people out, and all three fail quietly rather than loudly:

- **Rank columns are `text collate "C"`.** The default locale-aware collation doesn't sort bytewise, so Postgres and JavaScript disagree about ordering and lists reshuffle on refresh.
- **Sibling unique indexes need `NULLS NOT DISTINCT`.** Without it, root-level rows carry no uniqueness constraint at all.
- **The tree-sync trigger fires only on `UPDATE OF parent_id, published_at`.** Widening it causes infinite recursion.

## Self-hosting

Kortex runs on Postgres plus an S3-compatible or filesystem object store. A Docker Compose stack is planned for the 0.1 release; until then, `supabase start` is the supported way to run it locally.

Every piece of state is reproducible from `supabase/migrations/` and `supabase/seed.sql` - no dashboard-only configuration - so a self-hosted instance is a matter of pointing the app at your own Postgres and Storage.

## Roadmap

|                                         | Status      |
| --------------------------------------- | ----------- |
| Schema, RLS, visibility rules           | In progress |
| Auth, workspaces, app shell             | Planned     |
| Page tree, CRUD, drag ordering          | Planned     |
| Rich-text editor and autosave           | Planned     |
| Publishing and visibility states        | Planned     |
| Favourites, read analytics, attachments | Planned     |
| Invites, roles, billing                 | Planned     |
| Docker Compose self-host, 0.1 release   | Planned     |

## Contributing

Contributions are welcome, and early is a good time - the design is still settling.

- Open an issue before starting anything substantial, so we don't duplicate work
- Read `docs/ARCHITECTURE.md` for schema, ordering, or permissions changes
- Run `npm run lint && npm run typecheck` before pushing
- Every schema change ships as a migration in `supabase/migrations/`. `npx supabase db reset` on a clean checkout must produce a working app - that's the test CI runs.

If something in the setup above didn't work, that's a bug worth filing. Getting a new contributor running in two commands is a goal, not a nice-to-have.

## License

_To be determined before the first public release._

## Acknowledgements

Built on [Supabase](https://supabase.com), [Next.js](https://nextjs.org), [Tiptap](https://tiptap.dev), [shadcn/ui](https://ui.shadcn.com), [dnd-kit](https://dndkit.com), and [TanStack Query](https://tanstack.com/query).
