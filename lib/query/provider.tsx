"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query/get-query-client";

/**
 * Mounted once, high in the app tree.
 *
 * `getQueryClient()` rather than `useState(() => new QueryClient())`: the same
 * accessor has to serve the server prefetch and this provider, or the dehydrated
 * state and the client cache would be two different stores.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
