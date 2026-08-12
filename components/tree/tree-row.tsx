import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { publishState } from "@/lib/visibility";
import { PageGlyph, PublishWord } from "@/components/ui/publish-state";
import type { TreeItem } from "@/lib/types";

/* ---------------------------------------------------------------------------
   One row of the sidebar tree.

   Presentational: it renders whatever depth, state and drag flags it is
   handed. All of the visual consequences of those flags -- indentation, the
   size/weight/ink taper, hover, selection, the three drag treatments -- are
   expressed by the `tree-row` utility in app/globals.css keyed off data
   attributes, so this file contains no colour or spacing decisions.

   Depth is passed to CSS twice, deliberately: as `--depth` for the
   indentation arithmetic (one rule covers unbounded depth) and as
   `data-depth` for the taper (six discrete steps, clamped at 5).
   --------------------------------------------------------------------------- */

/** How the row is participating in a drag, if at all. */
export type TreeRowDragState = "lifted" | "into" | "invalid";

export interface TreeRowProps {
  item: TreeItem;
  href: string;
  isActive?: boolean;
  isExpanded?: boolean;
  dragState?: TreeRowDragState;
  onToggle?: () => void;
  /** Rendered into the row's hover cluster: add, overflow, drag handle. */
  actions?: React.ReactNode;
  /** Spread onto the row container by the drag library. */
  containerProps?: React.ComponentProps<"div">;
}

export function TreeRow({
  item,
  href,
  isActive,
  isExpanded,
  dragState,
  onToggle,
  actions,
  containerProps,
}: TreeRowProps) {
  const label = item.kind === "collection" ? item.name : item.title;
  const state = item.kind === "page" ? publishState(item) : null;

  return (
    <div
      {...containerProps}
      style={{ "--depth": item.depth } as React.CSSProperties}
      data-depth={Math.min(item.depth, 5)}
      data-state={isActive ? "active" : undefined}
      data-drag={dragState}
      className={cn("tree-row group/row", containerProps?.className)}
    >
      {item.hasChildren ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={isExpanded}
          data-expanded={isExpanded ? "" : undefined}
          className="flex size-2.5 flex-none items-center justify-center text-faint transition-transform duration-expand ease-kortex data-expanded:rotate-90"
        >
          <ChevronGlyph />
        </button>
      ) : (
        <span aria-hidden="true" className="size-2.5 flex-none" />
      )}

      <Link href={href} className="flex min-w-0 flex-1 items-center gap-1.75">
        {item.kind === "collection" ? (
          <span aria-hidden="true" className="flex-none text-ui leading-none">
            {item.icon ?? "📁"}
          </span>
        ) : (
          <PageGlyph state={state!} />
        )}
        <span className="truncate">{label}</span>
      </Link>

      {state ? <PublishWord state={state} /> : null}

      {actions ? (
        <span className="ml-auto flex flex-none items-center gap-px opacity-0 transition-opacity duration-state ease-kortex group-hover/row:opacity-100 group-focus-within/row:opacity-100">
          {actions}
        </span>
      ) : null}

      {isActive ? (
        <span
          aria-hidden="true"
          className="ml-auto size-1.25 flex-none rounded-full bg-primary group-hover/row:hidden"
        />
      ) : null}
    </div>
  );
}

function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className="size-2.25"
    >
      <path
        d="M3.5 2L6.5 5L3.5 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
   The drop line between two siblings. Rendered by the tree, not the row,
   because it occupies the gap rather than belonging to either neighbour.
   --------------------------------------------------------------------------- */

export interface TreeDropLineProps {
  depth: number;
}

export function TreeDropLine({ depth }: TreeDropLineProps) {
  return (
    <li
      aria-hidden="true"
      style={{ "--depth": depth } as React.CSSProperties}
      className="tree-row py-0.5"
    >
      <span className="size-1.5 flex-none rounded-full bg-primary" />
      <span className="h-0.5 flex-1 rounded-full bg-primary" />
    </li>
  );
}

/* ---------------------------------------------------------------------------
   The skeleton shown while an expanded node loads its children.
   Same indentation and rhythm as the rows it replaces.
   --------------------------------------------------------------------------- */

export interface TreeRowSkeletonProps {
  depth: number;
  /** Widths vary so the group does not read as a table. */
  width?: "sm" | "md" | "lg";
}

export function TreeRowSkeleton({ depth, width = "md" }: TreeRowSkeletonProps) {
  return (
    <li
      style={{ "--depth": depth } as React.CSSProperties}
      className="tree-row gap-2"
    >
      <span className="skeleton size-3.25 flex-none rounded-chip" />
      <span
        className={cn(
          "skeleton h-2.25",
          width === "sm" && "w-24",
          width === "md" && "w-30",
          width === "lg" && "w-35",
        )}
      />
    </li>
  );
}
