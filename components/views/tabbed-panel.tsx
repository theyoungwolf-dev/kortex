"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsPanel,
  TabsTrigger,
} from "@/components/ui/tabs";

/* ---------------------------------------------------------------------------
   The PAGES / DETAILS panel beneath a page or collection.

   Client, because Radix owns the tab roving-focus and selection. Its two
   bodies arrive as `children` slots, so the child-page list and the details
   table stay Server Components and no page data crosses the boundary.

   The add button rides in the tab strip rather than the panel, exactly as
   drawn -- it belongs to the collection of pages, not to either tab.
   --------------------------------------------------------------------------- */

export interface TabbedPanelProps {
  pages: React.ReactNode;
  details: React.ReactNode;
  /** Count shown beside the PAGES label; omitted when zero. */
  pageCount?: number;
  addLabel?: string;
  onAdd?: () => void;
}

export function TabbedPanel({
  pages,
  details,
  pageCount,
  addLabel = "New page",
  onAdd,
}: TabbedPanelProps) {
  return (
    <Tabs defaultValue="pages">
      <div className="flex items-end gap-0.5">
        <TabsList variant="folder" className="w-auto">
          <TabsTrigger value="pages">
            Pages
            {pageCount ? (
              <span className="text-muted-foreground">{pageCount}</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <Button
          size="fab"
          aria-label={addLabel}
          onClick={onAdd}
          className="mb-1 ml-auto"
        >
          <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M6 2.5v7M2.5 6h7"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </Button>
      </div>

      <TabsContent value="pages">
        <TabsPanel>{pages}</TabsPanel>
      </TabsContent>
      <TabsContent value="details">
        <TabsPanel className="px-5 py-4">{details}</TabsPanel>
      </TabsContent>
    </Tabs>
  );
}
