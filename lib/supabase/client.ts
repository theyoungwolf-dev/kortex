import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

/**
 * The Supabase client for Client Components.
 *
 * `@supabase/ssr` already singletons this in the browser, so calling it repeatedly
 * is cheap and every caller shares one auth state.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/**
 * The accessor query files and hooks should use. Named separately from
 * `createClient` so a query function reads as "give me the browser db" rather
 * than "construct a client", which is what keeps `lib/queries/*` agnostic about
 * which side of the boundary it is running on.
 */
export const browserDb = createClient;
