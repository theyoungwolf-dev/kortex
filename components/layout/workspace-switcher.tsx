"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceRef } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The workspace chip at the top of the sidebar, plus its menu.

   Client only because of the Radix menu -- the directive sits here rather
   than on the sidebar so the rest of the chrome stays on the server.
   --------------------------------------------------------------------------- */

export interface WorkspaceSwitcherProps {
  workspace: WorkspaceRef;
  workspaces?: WorkspaceRef[];
}

export function WorkspaceSwitcher({
  workspace,
  workspaces = [],
}: WorkspaceSwitcherProps) {
  const others = workspaces.filter((w) => w.id !== workspace.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-w-0 items-center gap-2 rounded-control px-1 py-1 text-left transition-colors duration-state ease-kortex hover:bg-raised">
        <span className="flex size-6.5 flex-none items-center justify-center rounded-card bg-primary text-eyebrow font-semibold text-primary-foreground">
          {workspace.initials}
        </span>
        <span className="truncate text-ui font-semibold tracking-tight text-ink">
          {workspace.name}
        </span>
        <svg
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className="size-2.5 flex-none text-muted-foreground"
        >
          <path
            d="M2.5 4L5 6.5L7.5 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>{workspace.name}</DropdownMenuLabel>
        <DropdownMenuItem>Workspace settings</DropdownMenuItem>
        <DropdownMenuItem>Invite people</DropdownMenuItem>
        <DropdownMenuItem>Trash</DropdownMenuItem>
        {others.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
            {others.map((w) => (
              <DropdownMenuItem key={w.id}>{w.name}</DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem>Create a workspace</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------------------------------------------------------------------------
   The three icon buttons beside the workspace chip.
   --------------------------------------------------------------------------- */

export interface SidebarToolbarProps {
  /** Workspace-scoped link prefix, e.g. "/w/ty-wolf". */
  basePath?: string;
  onToggleSidebar?: () => void;
}

export function SidebarToolbar({
  basePath = "",
  onToggleSidebar,
}: SidebarToolbarProps) {
  return (
    <div className="ml-auto flex flex-none items-center gap-0.5">
      <Button variant="ghost" size="sm" aria-label="Home" asChild>
        <Link href={basePath || "/"}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2.5 7L8 2.5L13.5 7v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </Button>
      <Button variant="ghost" size="sm" aria-label="Settings" asChild>
        <Link href={`${basePath}/settings`}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle
              cx="8"
              cy="8"
              r="2.4"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Collapse sidebar"
        onClick={onToggleSidebar}
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect
            x="2"
            y="3"
            width="12"
            height="10"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path d="M6.2 3v10" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </Button>
    </div>
  );
}
