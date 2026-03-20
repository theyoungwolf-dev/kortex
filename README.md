# 🧠 Kortex

**A high-concurrency, Notion-like hierarchical document management system.**

Kortex is an open-source workspace built to handle infinitely nested document trees and concurrent user editing. It focuses on zero-latency data integrity, leveraging a custom LexoRank mathematical sorting algorithm and a rigorous Graph ORM backend.

## 🏗️ Architecture Spotlight

Building a hierarchical, drag-and-drop document system presents significant database scaling challenges. Kortex solves these through two core architectural pillars:

- **Zero-Latency Reordering (LexoRank):** Instead of using brittle integer-based sorting (which causes cascading database write-locks) or linked lists (which cause recursive query nightmares), Kortex utilizes a custom Base-62 cryptographic string sorting algorithm. Dragging a page instantly calculates a mathematical string "midpoint" between adjacent rows, allowing infinite concurrent inserts with $O(1)$ database writes.
- **Graph-Based Hierarchy:** Relational hierarchies are managed via **[Ent](https://entgo.io/)**, a graph-based ORM. This allows for strict, statically typed parent/child edge relationships and efficient subgraph querying for nested document trees.

## 🧰 Core Features

- **Infinite Page Trees:** Create, nest, and organize collections and pages with no depth limits.
- **Concurrent Drag-and-Drop:** Move pages anywhere in the hierarchy instantly without locking surrounding database rows.
- **Rich Text Editing:** A deeply integrated, modular [TipTap](https://tiptap.dev/) (ProseMirror) editor supporting blocks, formatting, and embedded media.
- **Optimistic UI:** The Next.js frontend utilizes optimistic cache updates via Apollo Client to make page sorting and creation feel completely local and instant.
- **Media Management:** S3-compatible (MinIO) object storage for secure image and document embedding within the editor.

## 🎞️ Tech Stack

| Frontend                                    | Backend                                 | Infrastructure |
| ------------------------------------------- | --------------------------------------- | -------------- |
| Next.js (React)                             | Go (Fx Dependency Injection)            | Docker         |
| Apollo Client                               | [GQLGen](https://gqlgen.com/) (GraphQL) | Postgres       |
| [TipTap](https://tiptap.dev/) / ProseMirror | [Ent](https://entgo.io/) (Graph ORM)    | MinIO (S3)     |
| Tailwind CSS                                | Custom Base-62 LexoRank Engine          | Docker Compose |

## 🧑‍💻 Repository Structure

```bash
kortex/
├── client/                     # Next.js frontend, Apollo GraphQL state, TipTap editor
├── server/                     # Go backend, Fx modules, gqlgen resolvers, Ent schemas
├── docker-compose.yml          # Dev infra (Postgres, MinIO)
└── README.md
```

## 🚀 Getting Started (Dev Environment)

### Prerequisites

- Docker + Docker Compose
- Node.js (v18+)
- Go (v1.24+)

### 1. Start Infrastructure (Database & MinIO)

```bash
git clone https://github.com/theyoungwolf-dev/kortex.git
cd kortex
docker-compose up -d
```

This spins up:

- Postgres (port 5432)
- MinIO for object storage (port 9000)
- MinIO Console (port 9001)

### 2. Configure & Run Backend

Create a `config.yaml` file in `server/` based on the example config, then start the Go server.

```bash
cd server
cp config.example.yaml config.yaml # Update config.yaml
go run main.go
```

### 3. Configure & Run Frontend

Create a `.env.local` file in `client/` and generate the strict TypeScript GraphQL types.

```bash
cd ../client
cp .env.example .env.local # Update .env.local
npm install
npm run codegen
npm run dev
```

Access the app at http://localhost:3000

### 8. Access MinIO (for local media)

- Console: http://localhost:9001
- Access Key: `minioadmin`
- Secret Key: `minioadmin`

## 🛠 Roadmap Highlights

- **Real-Time Collaboration**
  Implementing WebSockets/Yjs for multiplayer cursor tracking and simultaneous block editing.
- **Granular RBAC**
  Role-based access control inherited recursively down the Ent graph edges (Workspace -> Folder -> Page).
- **Block-Based Storage**
  Migrating the TipTap JSON output into distinct database rows for block-level referencing and transclusion.
- **Version History**
  Implementing a Git-like version control system for pages, allowing users to view and revert changes over time.
- **Inline Comments & Mentions**
  Adding support for inline comments and user mentions within the editor, with real-time notifications.
- **Public Sharing & Embedding**
  Allowing users to share pages publicly via unique URLs and embed them on external sites.
- **Mobile Optimization**
  Building a responsive mobile interface with touch-friendly drag-and-drop and editor interactions.

## ⚖️ License

AGPLv3 License — see [LICENSE](./LICENSE)
