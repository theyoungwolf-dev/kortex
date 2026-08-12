"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreGlyph } from "@/components/tree/tree-row-actions";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { ActorRef } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The account row pinned to the bottom of the sidebar.
   --------------------------------------------------------------------------- */

export interface AccountMenuProps {
  actor: ActorRef;
}

export function AccountMenu({ actor }: AccountMenuProps) {
  return (
    <div className="flex items-center gap-2.25 border-t border-border-soft px-3 py-2.75">
      <span
        data-tone={actor.tone}
        className="avatar-chip size-7 text-meta"
        aria-hidden="true"
      >
        {actor.initials}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-label font-mid text-ink">
          {actor.displayName}
        </span>
        {actor.email ? (
          <span className="truncate text-meta text-muted-foreground">
            {actor.email}
          </span>
        ) : null}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Account menu"
            className="ml-auto"
          >
            <MoreGlyph vertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56">
          <DropdownMenuItem>Account settings</DropdownMenuItem>
          <DropdownMenuItem>Keyboard shortcuts</DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <ThemeToggle />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
