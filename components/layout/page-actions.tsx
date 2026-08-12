"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MoreGlyph } from "@/components/tree/tree-row-actions";

/* ---------------------------------------------------------------------------
   The interactive half of the page header: star and overflow.
   Kept apart from PageHeader so the header stays a Server Component.
   --------------------------------------------------------------------------- */

export interface StarToggleProps {
  isStarred: boolean;
  onToggle?: (next: boolean) => void;
}

export function StarToggle({ isStarred, onToggle }: StarToggleProps) {
  const [starred, setStarred] = React.useState(isStarred);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-pressed={starred}
          aria-label={starred ? "Remove from favourites" : "Add to favourites"}
          data-state={starred ? "on" : undefined}
          onClick={() => {
            setStarred(!starred);
            onToggle?.(!starred);
          }}
          className="data-[state=on]:text-primary"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.4 4.3 13.3l.8-4.1L2 6.3l4.2-.5z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
              className={starred ? "fill-primary" : "fill-none"}
            />
          </svg>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {starred ? "Remove from favourites" : "Add to favourites"}
      </TooltipContent>
    </Tooltip>
  );
}

export interface PageActionsMenuProps {
  onCopyLink?: () => void;
  onDuplicate?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

export function PageActionsMenu({
  onCopyLink,
  onDuplicate,
  onMove,
  onDelete,
}: PageActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="quiet" size="icon" aria-label="Page actions">
          <MoreGlyph vertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onCopyLink?.()}>
          Copy link
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onDuplicate?.()}>
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMove?.()}>
          Move to…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete?.()}>
          Move to Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
