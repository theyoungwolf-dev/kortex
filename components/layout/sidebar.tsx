import { ScrollArea } from "@/components/ui/scroll-area";
import { AccountMenu } from "@/components/layout/account-menu";
import {
  SidebarToolbar,
  WorkspaceSwitcher,
} from "@/components/layout/workspace-switcher";
import { SidebarTree } from "@/components/tree/sidebar-tree";
import type { ActorRef, SidebarSection, WorkspaceRef } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Sidebar chrome.

   A Server Component. The tree data arrives here as a serialisable array and
   is handed to the client tree, which owns only expansion, selection and drag
   state. The chrome around it -- workspace chip, scroll container, account
   row -- has no interactivity of its own; the two menus inside it are their
   own client components.
   --------------------------------------------------------------------------- */

export interface SidebarProps {
  workspace: WorkspaceRef;
  workspaces?: WorkspaceRef[];
  actor: ActorRef;
  sections: SidebarSection[];
  activeId?: string;
  expandedIds?: string[];
  /** Workspace-scoped link prefix, e.g. "/w/ty-wolf". */
  basePath?: string;
}

export function Sidebar({
  workspace,
  workspaces,
  actor,
  sections,
  activeId,
  expandedIds,
  basePath,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex flex-none items-center gap-2 border-b border-border-soft py-3 pr-3 pl-3.5">
        <WorkspaceSwitcher workspace={workspace} workspaces={workspaces} />
        <SidebarToolbar basePath={basePath} />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pt-2.5 pb-4">
          <SidebarTree
            sections={sections}
            activeId={activeId}
            initialExpandedIds={expandedIds}
            basePath={basePath}
          />
        </div>
      </ScrollArea>

      <AccountMenu actor={actor} />
    </div>
  );
}
