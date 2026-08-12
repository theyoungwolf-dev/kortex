import { PageGlyph, PublishWord } from "@/components/ui/publish-state";
import { publishState } from "@/lib/visibility";
import type { TreeItem } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The product screenshot on the marketing page.

   A real render of the real tokens rather than an image: it cannot drift from
   the product, it stays sharp at any density, and it themes with the rest of
   the page. It is static markup -- no expansion, no drag, no client bundle --
   which is why it does not reuse the interactive tree.
   --------------------------------------------------------------------------- */

export interface MarketingTreeProps {
  items: TreeItem[];
  activeId?: string;
}

export function MarketingTree({ items, activeId }: MarketingTreeProps) {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-0.5 border-r border-border-soft p-3"
    >
      <span className="eyebrow px-1.5 pt-1 pb-2">Workspace Collections</span>

      {items.map((item) => {
        const state = item.kind === "page" ? publishState(item) : null;
        return (
          <div
            key={item.id}
            style={{ "--depth": item.depth } as React.CSSProperties}
            data-depth={Math.min(item.depth, 5)}
            data-state={item.id === activeId ? "active" : undefined}
            className="tree-row"
          >
            {item.kind === "collection" ? (
              <span className="flex-none text-ui leading-none">
                {item.icon ?? "📁"}
              </span>
            ) : (
              <PageGlyph state={state!} lines={false} className="size-3" />
            )}
            <span className="truncate">
              {item.kind === "collection" ? item.name : item.title}
            </span>
            {state ? <PublishWord state={state} className="ml-auto" /> : null}
          </div>
        );
      })}
    </div>
  );
}
