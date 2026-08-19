// Turns "a client module imported this" from a confusing bundler trace into a
// build error naming the file. That mistake is easy to make, because the query
// modules in lib/queries/ are deliberately isomorphic - the same function runs
// here and in the browser - so only the *loaders* may reach for this client.
import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/**
 * The Supabase client for Server Components and Server Actions.
 *
 * Wrapped in React `cache()` so a single request builds one client rather than
 * one per call site - supabase-js then resolves and refreshes the session once.
 * `cache()` is scoped to the current request with no sharing between requests,
 * which is the property RLS requires: a module-level singleton here would be
 * shared across concurrent users.
 *
 * Reading cookies makes every caller dynamic. With `cacheComponents: true` that
 * means **this may only be called inside a component beneath a `<Suspense>`
 * boundary** - a call in a route component's own body fails the
 * blocking-prerender check at build time.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, which cannot set cookies. Safe to
            // ignore: `proxy.ts` refreshes the session on every request.
          }
        },
      },
    },
  );
});
