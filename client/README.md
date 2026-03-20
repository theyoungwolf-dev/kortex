# 🧩 Kortex Frontend

This is the frontend of **Kortex**, a Next.js-based web app for note taking and managing personal wiki. It powers the UI for both the hosted SaaS version and self-hosted installations.

## 🧑‍🎨 Tech Stack

- **[Next.js](https://nextjs.org/)** – React framework for server-rendered apps
- **[Tailwind CSS](https://tailwindcss.com/)** – Utility-first styling
- **[HeroUI](https://heroui.dev/)** – Component toolkit used throughout
- **[Apollo Client](https://www.apollographql.com/docs/react/)** – GraphQL queries and caching
- **[GraphQL Code Generator](https://www.graphql-code-generator.com/)** – Type-safe queries/mutations
- **[TipTap](https://tiptap.dev/)** – Rich-text editor, powered by [`shadcn-minimal-tiptap`](https://shadcn-minimal-tiptap.vercel.app/)
- **[apollo-upload-client](https://github.com/jaydenseric/apollo-upload-client)** – Uploads via GraphQL mutations (e.g., profile pictures)
- **[Auth.js](https://authjs.dev/)** - Authentication and session handling

## 📁 Folder Layout

```bash
client/
├── assets/                 # Used in OG images and API routes
├── public/                 # Logos, static placeholders, etc.
└── src/
    ├── apollo-client/      # Apollo setup, auth handling, upload link
    ├── app/                # App Router - used for public/marketing pages
    ├── auth/               # Auth.js configuration
    ├── components/         # Reusable UI components
    ├── contexts/           # React contexts
    ├── gql/                # Auto-generated GraphQL types
    ├── hooks/              # Custom hooks
    ├── literals/           # UI literals & constants
    ├── pages/              # Pages Router - main CSR app shell
    ├── styles/             # Global styles
    ├── utils/              # Helpers and utility functions
    └── middleware.ts       # Auth protection for non-public routes
```

---

## 🧪 Development Setup

### 1. Install Dependencies

```bash
cd client
npm install
```

### 2. Configure Environment

Create your `.env.local` file:

```bash
cp .env.example .env.local
```

Configure the GraphQL endpoint and your auth providers.

### 3. Generate GraphQL Types

```bash
npm run codegen
```

This uses the GraphQL schema from the running backend to generate fully typed `TypedDocumentNodes`.

### 4. Start the Dev Server

```bash
npm run dev
```

The app will be available at: [http://localhost:3000](http://localhost:3000)

## 📡 Notes

- All uploads (e.g., page attachments) use **S3 presigned URLs** via backend GraphQL resolvers

## 🤝 Contributing

We welcome UI/UX, accessibility, and component-level improvements. PRs welcome!

## ⚖️ License

AGPLv3 License — see [LICENSE](../LICENSE)

---

Made with ❤️ and TypeScript
