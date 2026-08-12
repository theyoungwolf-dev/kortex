"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Tabs, in the two shapes the design actually uses.

   `folder`  the PAGES / DETAILS strip on the page and collection views. The
             active tab is a physical continuation of the panel beneath it:
             it shares the panel's fill and paints its own bottom border out,
             so the two read as one piece of card stock. Pair it with
             <TabsPanel>, which supplies the matching body.

   `line`    the workspace settings strip. Mono eyebrows over a hairline,
             with the active tab underlined in the structural blue.

   `default` shadcn's segmented pill. Unused by the design, retained so the
             primitive stays a drop-in, now wearing Kortex tokens.
   --------------------------------------------------------------------------- */

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex data-[orientation=horizontal]:flex-col",
        className,
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit text-muted-foreground",
  {
    variants: {
      variant: {
        default: "h-9 items-center justify-center rounded-card bg-muted p-0.75",
        line: "h-auto items-center gap-6 rounded-none border-b border-border-soft bg-transparent",
        folder: "h-auto w-full items-end gap-0.5 rounded-none bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors duration-state ease-kortex disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",

        /* default -- segmented pill */
        "group-data-[variant=default]/tabs-list:flex-1 group-data-[variant=default]/tabs-list:rounded-control group-data-[variant=default]/tabs-list:px-2 group-data-[variant=default]/tabs-list:py-1 group-data-[variant=default]/tabs-list:text-ui group-data-[variant=default]/tabs-list:font-medium group-data-[variant=default]/tabs-list:data-[state=active]:bg-canvas group-data-[variant=default]/tabs-list:data-[state=active]:text-ink group-data-[variant=default]/tabs-list:data-[state=active]:shadow-e1",

        /* line -- mono eyebrow over a hairline, underlined when active */
        "group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:py-3.25 group-data-[variant=line]/tabs-list:font-mono group-data-[variant=line]/tabs-list:text-meta group-data-[variant=line]/tabs-list:font-semibold group-data-[variant=line]/tabs-list:tracking-chip group-data-[variant=line]/tabs-list:uppercase group-data-[variant=line]/tabs-list:hover:text-ink group-data-[variant=line]/tabs-list:data-[state=active]:border-primary group-data-[variant=line]/tabs-list:data-[state=active]:text-primary",

        /* folder -- the active tab is the top edge of the panel below it */
        "group-data-[variant=folder]/tabs-list:rounded-t-card group-data-[variant=folder]/tabs-list:border group-data-[variant=folder]/tabs-list:border-border group-data-[variant=folder]/tabs-list:bg-sunken group-data-[variant=folder]/tabs-list:px-4 group-data-[variant=folder]/tabs-list:py-2.5 group-data-[variant=folder]/tabs-list:font-mono group-data-[variant=folder]/tabs-list:text-meta group-data-[variant=folder]/tabs-list:font-semibold group-data-[variant=folder]/tabs-list:tracking-chip group-data-[variant=folder]/tabs-list:uppercase group-data-[variant=folder]/tabs-list:hover:text-ink group-data-[variant=folder]/tabs-list:data-[state=active]:z-2 group-data-[variant=folder]/tabs-list:data-[state=active]:border-b-canvas group-data-[variant=folder]/tabs-list:data-[state=active]:bg-canvas group-data-[variant=folder]/tabs-list:data-[state=active]:py-2.75 group-data-[variant=folder]/tabs-list:data-[state=active]:text-primary",

        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

/**
 * The card body a `folder` tab strip sits on. The negative top margin is what
 * lets the active tab's bottom border overlap the panel's top border, so the
 * seam disappears; the top-left corner stays square because a tab is always
 * above it.
 */
function TabsPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="tabs-panel"
      className={cn(
        "-mt-px rounded-b-card rounded-tr-card border border-border bg-canvas px-2 py-1.5 shadow-e1",
        className,
      )}
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabsPanel,
  tabsListVariants,
};
