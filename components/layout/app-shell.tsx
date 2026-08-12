import * as React from "react";

/* ---------------------------------------------------------------------------
   The two-pane application frame.

   Server Component. It takes the sidebar as a slot rather than rendering it,
   so a route can wrap the sidebar in its own <Suspense> boundary and stream
   the personalised tree in behind a skeleton while this frame paints
   immediately.

   Widths follow the breakpoint contract: the sidebar is absent below md
   (a drawer takes over), 260px at md, 272px at lg and 296px at xl.
   --------------------------------------------------------------------------- */

export interface AppShellProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-65 flex-none border-r border-border md:block lg:w-68 xl:w-74">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The main column's scroll container. Separate from AppShell so a route can
   put a sticky header outside it.
   --------------------------------------------------------------------------- */

export interface AppMainProps {
  children: React.ReactNode;
}

export function AppMain({ children }: AppMainProps) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto pt-6 pb-20 md:pt-8.5">
      {children}
    </main>
  );
}
