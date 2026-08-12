import Link from "next/link";

import { PageGlyph, PublishWord } from "@/components/ui/publish-state";
import { publishState } from "@/lib/visibility";
import type { ChildPageRow } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The PAGES tab body: a page's direct children, or a collection's root pages.

   Server Component. Rows are links, hairline-separated, and carry the same
   publish vocabulary as the tree -- same glyph, same word, same tokens.
   --------------------------------------------------------------------------- */

export interface ChildPageListProps {
  pages: ChildPageRow[];
  /** Already formatted, keyed by page id, e.g. "Updated 07/04/2026". */
  updatedLabels: Record<string, string>;
  empty?: React.ReactNode;
}

export function ChildPageList({
  pages,
  updatedLabels,
  empty,
}: ChildPageListProps) {
  if (pages.length === 0) return <>{empty}</>;

  return (
    <ul>
      {pages.map((page, index) => {
        const state = publishState(page);
        return (
          <li key={page.id}>
            {index > 0 ? (
              <div aria-hidden="true" className="mx-3 h-px bg-background" />
            ) : null}
            <Link
              href={page.href}
              className="flex items-center gap-2.75 rounded-control px-3 py-3.25 transition-colors duration-state ease-kortex hover:bg-sidebar"
            >
              <PageGlyph state={state} className="size-3.75" />
              <span className="truncate text-item font-medium text-ink">
                {page.title}
              </span>
              <PublishWord state={state} />
              <span className="ml-auto flex-none text-label text-muted-foreground">
                {updatedLabels[page.id]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
