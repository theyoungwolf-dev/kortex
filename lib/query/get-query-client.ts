import { QueryClient, defaultShouldDehydrateQuery, environmentManager } from "@tanstack/react-query";

import { cache } from "react";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that a client-side navigation does not immediately
        // refetch what the server just streamed down.
        staleTime: 30_000,
        retry: 1,
      },
      dehydrate: {
        // The server prefetch is deliberately NOT awaited, so queries are still
        // `pending` when dehydrate() runs. Without this they would be dropped
        // from the payload and every hook would refetch on mount.
        shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

/**
 * A new client per server request; a singleton in the browser.
 *
 * **The `isServer` branch is a security control, not a performance detail.** A
 * module-level singleton on the server would be shared across concurrent
 * requests, and every row in it arrived through RLS under one specific user's
 * JWT. There is no type-level protection against this - it would simply start
 * serving one tenant's tree to another under load.
 *
 * The server branch is wrapped in React `cache()` rather than being constructed
 * fresh at each call site, so a layout and the route beneath it prefetch into
 * the *same* client and a list both need is fetched once. `cache()` is scoped to
 * one request with no sharing between requests, which is exactly the guarantee
 * that makes it safe here.
 *
 * The cost is that each `dehydrate()` serialises everything accumulated so far,
 * so duplicated entries across two `<HydrationBoundary>`s are merged on the
 * client by `dataUpdatedAt`. That is a bytes cost only - but it is a reason to
 * keep boundaries few and high in the tree.
 */
const getServerQueryClient = cache(makeQueryClient);

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) return getServerQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}
