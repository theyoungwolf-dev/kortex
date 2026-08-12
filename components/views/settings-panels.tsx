import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { MemberRow, WorkspaceRef } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Workspace settings: the general pane, the member list, the danger zone.

   Server Components throughout. The only client parts are the theme toggle
   and the delete confirmation, both of which arrive as their own components.
   --------------------------------------------------------------------------- */

export interface SettingsCardProps {
  children: React.ReactNode;
}

export function SettingsCard({ children }: SettingsCardProps) {
  return (
    <div className="overflow-hidden rounded-panel border border-border bg-canvas shadow-e1">
      {children}
    </div>
  );
}

export interface GeneralPaneProps {
  workspace: WorkspaceRef;
}

export function GeneralPane({ workspace }: GeneralPaneProps) {
  return (
    <div className="flex flex-col gap-5 px-6.5 py-5.5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-name">Name</Label>
        <Input id="workspace-name" defaultValue={workspace.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="workspace-slug">Slug</Label>
        <Input
          id="workspace-slug"
          defaultValue={workspace.slug}
          className="font-mono"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-sunken px-4 py-3.5">
        <div className="flex flex-col gap-0.75">
          <span className="text-ui font-mid text-ink">Appearance</span>
          <span className="text-label leading-normal text-muted-foreground">
            Follows your system by default
          </span>
        </div>
        <ThemeToggle />
      </div>

      {/* The only red in the product, and it names what it destroys. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger-border bg-danger-soft px-4 py-3.5">
        <div className="flex flex-col gap-0.75">
          <span className="text-ui font-mid text-danger-ink">
            Delete workspace
          </span>
          <span className="text-label leading-normal text-danger-ink/80">
            Removes every collection and page. Not reversible.
          </span>
        </div>
        <ConfirmDeleteDialog
          title={workspace.name}
          confirmLabel="Delete workspace"
          affected={["Every collection", "Every page", "Every attachment"]}
        >
          <Button variant="destructive-outline" size="md">
            Delete
          </Button>
        </ConfirmDeleteDialog>
      </div>
    </div>
  );
}

export interface MembersPaneProps {
  members: MemberRow[];
  seats: number;
}

export function MembersPane({ members, seats }: MembersPaneProps) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-background px-6 py-4">
        <h2 className="text-h3 tracking-heading">Members</h2>
        <span className="text-label text-muted-foreground">
          {members.length} of {seats} seats
        </span>
        <Button size="md" className="ml-auto">
          Invite
        </Button>
      </div>

      <ul className="flex flex-col px-2.5 py-1.5">
        {members.map((member) => (
          <li key={member.id}>
            <div className="flex items-center gap-2.75 rounded-card px-3.5 py-3 transition-colors duration-state ease-kortex hover:bg-sidebar">
              {member.invitedAt ? (
                <span className="flex size-7.5 flex-none items-center justify-center rounded-full border border-dashed border-border-strong bg-sunken text-meta font-semibold text-muted-foreground">
                  ?
                </span>
              ) : (
                <Avatar actor={member.actor} size="lg" />
              )}

              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-ui font-mid text-ink">
                  {member.actor.displayName}
                </span>
                <span className="truncate text-meta text-muted-foreground">
                  {member.invitedAt ? "Invited 2 days ago" : member.actor.email}
                </span>
              </div>

              <Badge variant="soft" className="ml-auto capitalize">
                {member.role}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
