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
import type { TreeItem } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The hover cluster on a tree row: drag handle, add child, overflow menu.

   Client because of the drag handle ref and the Radix menu. The row itself
   stays presentational -- it renders whatever this returns into its actions
   slot and knows nothing about menus.
   --------------------------------------------------------------------------- */

export interface TreeRowActionsProps {
  item: TreeItem;
  /** From useSortable; makes the grip the only drag-initiating surface. */
  handleRef?: (element: Element | null) => void;
  onCreateChild?: (parentId: string) => void;
  onRename?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onCopyLink?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function TreeRowActions({
  item,
  handleRef,
  onCreateChild,
  onRename,
  onDuplicate,
  onCopyLink,
  onDelete,
}: TreeRowActionsProps) {
  const label = item.kind === "collection" ? item.name : item.title;

  return (
    <>
      <button
        ref={handleRef}
        type="button"
        aria-label={`Reorder ${label}`}
        className="flex size-5 flex-none cursor-grab items-center justify-center rounded-chip text-state-hidden hover:bg-raised-strong hover:text-ink active:cursor-grabbing"
      >
        <GripGlyph />
      </button>

      <Button
        variant="ghost"
        size="xs"
        aria-label={`New page in ${label}`}
        onClick={() => onCreateChild?.(item.id)}
      >
        <PlusGlyph />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" aria-label={`Actions for ${label}`}>
            <MoreGlyph />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => onRename?.(item.id)}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate?.(item.id)}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCopyLink?.(item.id)}>
            Copy link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete?.(item.id)}
          >
            Move to Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/* -- Glyphs ---------------------------------------------------------------- */

function GripGlyph() {
  return (
    <svg viewBox="0 0 10 14" aria-hidden="true" className="h-3.5 w-2.5">
      {[3, 7, 11].map((y) => (
        <React.Fragment key={y}>
          <circle cx="3" cy={y} r="1" fill="currentColor" />
          <circle cx="7" cy={y} r="1" fill="currentColor" />
        </React.Fragment>
      ))}
    </svg>
  );
}

function PlusGlyph() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="size-3">
      <path
        d="M6 2.5v7M2.5 6h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoreGlyph({ vertical = false }: { vertical?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3">
      {[2.5, 6, 9.5].map((n) => (
        <circle
          key={n}
          cx={vertical ? 6 : n}
          cy={vertical ? n : 6}
          r="1"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
