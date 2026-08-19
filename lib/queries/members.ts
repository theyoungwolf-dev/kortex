import { toActorRef } from "@/lib/db/map";
import type { Db } from "@/lib/db/types";
import type { MemberRow, PendingInvitation } from "@/lib/types";

/**
 * Seats and invitations - two tables, two shapes, never merged.
 *
 * `workspace_members` always has a profile behind it. `workspace_invitations`
 * has an email address and no profile row at all until it is accepted, which is
 * why an invitation cannot be represented as a member with a missing avatar.
 */
export async function listMembers(db: Db, workspaceId: string): Promise<MemberRow[]> {
  const { data, error } = await db
    .from("workspace_members")
    // Hinted by constraint name: workspace_members points at profiles twice
    // (`user_id` and `invited_by`), so an unhinted embed is ambiguous. The
    // generated types catch that at compile time rather than at runtime.
    .select(
      "id, role, joined_at, profile:profiles!workspace_members_user_id_fkey(id, username, display_name, full_name, avatar_path)",
    )
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    actor: toActorRef(row.profile),
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

/**
 * Live invitations only.
 *
 * `workspace_invitations_select` already limits this to workspace admins and to
 * the invitee themselves, so a plain member simply gets an empty list rather
 * than an error.
 */
export async function listInvitations(db: Db, workspaceId: string): Promise<PendingInvitation[]> {
  const { data, error } = await db
    .from("workspace_invitations")
    .select("id, email, role, created_at, expires_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    invitedAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

