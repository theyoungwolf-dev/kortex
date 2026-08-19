import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

/**
 * The Supabase client for Route Handlers.
 *
 * Deliberately a separate file from `server.ts`, because the cookie-write
 * semantics genuinely differ: a handler returns its own `Response`, so there is
 * no cookie jar for supabase-js to write a rotated token into. `setAll` is a
 * no-op and `proxy.ts` owns refresh - which is why its matcher must keep
 * covering `/api/*`.
 *
 * Keeping it separate also keeps `server.ts` free of the "just this once" pull
 * toward a service-role key. Handlers serve user requests, so they build from
 * the caller's cookies and RLS stays the only authorization layer.
 */
export function createRouteClient(request: NextRequest) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll() {
          // Handled by proxy.ts on the next request.
        },
      },
    },
  );
}
