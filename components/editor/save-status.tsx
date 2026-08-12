"use client";

import type { SaveStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";

/* ---------------------------------------------------------------------------
   The autosave indicator.

   Four states, one of which renders nothing. `idle` showing nothing is the
   point: a permanently visible "Saved" trains people to ignore it, so the
   indicator only speaks when something is in flight, has just landed, or has
   gone wrong.

   Conflict is not a failure of the network -- it is §9.4's optimistic
   concurrency guard reporting that the update matched zero rows because
   somebody else wrote first. The copy says what to do about it.
   --------------------------------------------------------------------------- */

const statusVariants = cva("inline-flex items-center gap-1.75 text-label font-book", {
  variants: {
    status: {
      idle: "hidden",
      saving: "text-ink-4",
      saved: "text-ink-4",
      conflict: "text-danger-ink",
    },
  },
  defaultVariants: { status: "idle" },
});

export interface SaveStatusIndicatorProps {
  status: SaveStatus;
  className?: string;
}

export function SaveStatusIndicator({ status, className }: SaveStatusIndicatorProps) {
  if (status === "idle") return null;

  return (
    <span role="status" aria-live="polite" data-status={status} className={cn(statusVariants({ status }), className)}>
      {status === "saving" ? (
        <span aria-hidden="true" className="size-1.75 flex-none animate-pulse-soft rounded-full bg-state-hidden" />
      ) : null}

      {status === "saved" ? (
        <svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="size-3 flex-none text-state-published">
          <path
            d="M2 6.2l2.6 2.6L10 3.4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}

      {status === "conflict" ? (
        <span aria-hidden="true" className="size-1.75 flex-none rounded-full bg-destructive" />
      ) : null}

      {LABELS[status]}
    </span>
  );
}

const LABELS: Record<Exclude<SaveStatus, "idle">, string> = {
  saving: "Saving",
  saved: "Saved",
  conflict: "Edited elsewhere - reload",
};
