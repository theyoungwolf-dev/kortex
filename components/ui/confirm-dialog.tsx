"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/* ---------------------------------------------------------------------------
   Destructive confirmation.

   The only red in the product lives here. The dialog names what is being
   deleted, states the blast radius -- a page takes its descendants with it --
   lists them, and says how long they are recoverable. That list is the whole
   reason this is a dialog and not a toast with an undo.

   Radix supplies the focus trap, the Escape handler, the scroll lock and the
   aria-describedby wiring, which is why this is a restyle rather than a
   hand-rolled overlay.
   --------------------------------------------------------------------------- */

export interface ConfirmDeleteDialogProps {
  /** Rendered as the trigger; use `asChild` semantics. */
  children: React.ReactNode;
  title: string;
  /** Descendants that go with it. Empty for a leaf. */
  affected?: string[];
  retentionDays?: number;
  confirmLabel?: string;
  onConfirm?: () => void;
}

export function ConfirmDeleteDialog({
  children,
  title,
  affected = [],
  retentionDays = 30,
  confirmLabel = "Move to Trash",
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md gap-0 rounded-panel p-6 shadow-e3">
        <DialogHeader className="gap-2.5">
          <DialogTitle className="font-display text-h3 tracking-heading">
            Delete “{title}”?
          </DialogTitle>
          <DialogDescription className="text-ui leading-relaxed text-ink-4">
            {affected.length > 0 ? (
              <>
                This page and its{" "}
                <strong className="font-semibold text-ink">
                  {affected.length === 1
                    ? "1 child page"
                    : `${affected.length} child pages`}
                </strong>{" "}
                move to Trash.
              </>
            ) : (
              <>This page moves to Trash.</>
            )}{" "}
            You can restore {affected.length > 0 ? "them" : "it"} for{" "}
            {retentionDays} days, after which{" "}
            {affected.length > 0 ? "they are" : "it is"} purged.
          </DialogDescription>
        </DialogHeader>

        {affected.length > 0 ? (
          <ul className="my-4 flex flex-col gap-1.25 rounded-card border border-border bg-sidebar px-3.25 py-2.75">
            {affected.map((name) => (
              <li key={name} className="text-label leading-normal text-ink-4">
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <div className="h-4" />
        )}

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
