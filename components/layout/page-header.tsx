import * as React from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import type { BreadcrumbItem as Crumb } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The 52px bar above the reading column.

   Server Component. The star toggle and the overflow menu are their own
   client components (components/layout/page-actions.tsx) and arrive through
   the `actions` slot, so the header itself never ships JavaScript.
   --------------------------------------------------------------------------- */

export interface PageHeaderProps {
  breadcrumb: Crumb[];
  actions?: React.ReactNode;
  /** The mobile drawer trigger; absent on routes without a tree. */
  navTrigger?: React.ReactNode;
}

export function PageHeader({
  breadcrumb,
  actions,
  navTrigger,
}: PageHeaderProps) {
  return (
    <header className="flex h-13 flex-none items-center gap-2.5 border-b border-border bg-sidebar pr-5 pl-4 md:pl-6">
      {navTrigger}
      <BreadcrumbTrail items={breadcrumb} />
      {actions ? (
        <div className="ml-auto flex flex-none items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

/**
 * The header's Suspense fallback.
 *
 * The bar itself is static -- same height, same rule, same ground -- so the
 * only thing that moves when the real breadcrumb arrives is the text. Without
 * this the whole header would pop in and the page would jump 52px.
 */
export function PageHeaderSkeleton() {
  return (
    <header
      aria-hidden="true"
      className="flex h-13 flex-none items-center gap-2.5 border-b border-border bg-sidebar pr-5 pl-4 md:pl-6"
    >
      <span className="skeleton h-2.25 w-28" />
      <span className="skeleton h-2.25 w-4 opacity-60" />
      <span className="skeleton h-2.25 w-36" />
    </header>
  );
}

/* ---------------------------------------------------------------------------
   The trail.

   Below lg the middle is elided to a single ellipsis, per the breakpoint
   contract; the full chain returns at lg. The elision is done with CSS rather
   than by slicing the array, so there is one DOM for both widths and no
   resize observer -- and every crumb stays in the accessibility tree, which
   matters because the trail is how a screen-reader user understands where a
   Hidden page sits.

   Ancestors carry their own publish state. That is deliberate: when a page is
   Hidden, the draft that is blocking it is somewhere in this trail, and
   marking it here is the first place a reader can see why.
   --------------------------------------------------------------------------- */

export interface BreadcrumbTrailProps {
  items: Crumb[];
}

export function BreadcrumbTrail({ items }: BreadcrumbTrailProps) {
  if (items.length === 0) return null;

  const last = items.length - 1;
  /* Crumbs between the first and the current one collapse below lg. */
  const isElided = (index: number) => index > 0 && index < last;
  const hasElision = items.length > 2;

  return (
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap gap-1.75 text-label">
        {items.map((item, index) => (
          <React.Fragment key={item.id}>
            {index > 0 ? (
              <BreadcrumbSeparator
                className={cn(
                  "text-separator [&>svg]:size-2.5",
                  isElided(index) && "hidden lg:flex",
                )}
              />
            ) : null}

            {/* The stand-in for everything hidden, shown once, in its place. */}
            {hasElision && index === 1 ? (
              <BreadcrumbItem className="lg:hidden">
                <BreadcrumbEllipsis className="size-3.5 text-muted-foreground" />
              </BreadcrumbItem>
            ) : null}
            {hasElision && index === 1 ? (
              <BreadcrumbSeparator className="text-separator lg:hidden [&>svg]:size-2.5" />
            ) : null}

            <BreadcrumbItem
              className={cn("min-w-0", isElided(index) && "hidden lg:flex")}
            >
              {index === last ? (
                <BreadcrumbPage className="truncate font-semibold text-ink">
                  {item.title}
                </BreadcrumbPage>
              ) : (
                <Link
                  href={item.href}
                  className="flex min-w-0 items-center gap-1.25 font-book whitespace-nowrap text-muted-foreground transition-colors duration-state ease-kortex hover:text-ink"
                >
                  {item.state && item.state !== "published" ? (
                    <span
                      aria-hidden="true"
                      className="size-1 flex-none rounded-full bg-faint"
                    />
                  ) : null}
                  <span className="truncate">
                    {item.state && item.state !== "published"
                      ? `${item.title} · ${item.state}`
                      : item.title}
                  </span>
                </Link>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
