"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/* ---------------------------------------------------------------------------
   Below md the sidebar becomes a drawer over the page, 88vw wide; at md it is
   340px. The trigger lives in the page header.

   The sidebar itself is passed in as a slot so it stays a Server Component --
   only the drawer shell is client.
   --------------------------------------------------------------------------- */

export interface MobileNavProps {
  children: React.ReactNode;
}

export function MobileNav({ children }: MobileNavProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Open navigation"
          className="md:hidden"
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="drawer-panel gap-0 border-border bg-sidebar p-0"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Favourites and collections in this workspace.
        </SheetDescription>
        {children}
      </SheetContent>
    </Sheet>
  );
}
