import { HiddenBanner } from "@/components/views/hidden-banner";
import { MetadataRow } from "@/components/views/metadata-row";
import { PageGlyph } from "@/components/ui/publish-state";
import type { PageViewData } from "@/lib/types";
import { publishState } from "@/lib/visibility";

/* ---------------------------------------------------------------------------
   The page reading surface.

   Server Component, and a scaffold rather than a screen: the title, the
   editor body and the tabbed panel arrive as slots so the interactive parts
   (inline title, Tiptap, tabs) can be client components without dragging this
   file across the boundary with them.
   --------------------------------------------------------------------------- */

export interface PageViewProps {
  page: PageViewData;
  editedLabel: string;
  createdLabel: string;
  /** The inline-editable title. Client. */
  title: React.ReactNode;
  /** The save indicator, aligned right of the PAGE eyebrow. Client. */
  saveStatus?: React.ReactNode;
  /** The editor, or rendered content for a read-only viewer. */
  children: React.ReactNode;
  /** The PAGES / DETAILS panel. */
  panel?: React.ReactNode;
}

export function PageView({ page, editedLabel, createdLabel, title, saveStatus, children, panel }: PageViewProps) {
  const state = publishState(page);

  return (
    <article className="reading-column flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <PageGlyph state={state} className="size-3.75 text-muted-foreground" />
        <span className="eyebrow">Page</span>
        {saveStatus ? <span className="ml-auto">{saveStatus}</span> : null}
      </div>

      {page.blockingAncestor ? <HiddenBanner blockingAncestor={page.blockingAncestor} /> : null}

      <div className="flex flex-col gap-3.5">
        {title}
        <MetadataRow
          actor={page.lastEditedBy}
          editedLabel={editedLabel}
          createdLabel={createdLabel}
          readerCount={page.readerCount}
          readers={page.readers}
        />
      </div>

      {children}

      {panel ? <div className="mt-1.5">{panel}</div> : null}
    </article>
  );
}

/* ---------------------------------------------------------------------------
   Rendered page content.

   Tiptap output is a document tree, so the styling belongs to the container
   rather than to per-element classes. Everything here resolves to type tokens;
   nothing sets a colour a component could contradict.
   --------------------------------------------------------------------------- */

export function PageProse({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={[
        "flex flex-col gap-4 text-body text-ink-2 text-pretty",
        "[&_h2]:mt-1.5 [&_h2]:text-h2 [&_h2]:tracking-heading",
        "[&_h3]:mt-1.5 [&_h3]:text-h3 [&_h3]:tracking-heading",
        "[&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.75 [&_ul]:pl-5.5",
        "[&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-1.75 [&_ol]:pl-5.5",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-separator [&_blockquote]:pl-4.5 [&_blockquote]:text-ink-4",
        "[&_code]:rounded-chip [&_code]:bg-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-item [&_code]:font-book",
        "[&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
