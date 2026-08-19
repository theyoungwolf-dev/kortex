import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";

/**
 * The one client type the query layer speaks.
 *
 * Every function in `lib/queries/` takes a `Db` as its first argument rather
 * than reaching for a factory itself. That is what lets the identical function
 * run in a Server Component prefetch and in a browser hook - which is in turn
 * what stops the dehydrated shape and the client shape from drifting apart.
 * That drift fails silently: the seeded value is ignored, the client refetches,
 * and all you see is a flash.
 */
export type Db = SupabaseClient<Database>;

export type WorkspaceRow = Tables<"workspaces">;
export type CollectionRow = Tables<"collections">;
export type PageRow = Tables<"pages">;
export type ProfileRow = Tables<"profiles">;

/** Which sidebar section a collection belongs to, derived from `private_to`. */
export type OwnerKind = "personal" | "workspace";
