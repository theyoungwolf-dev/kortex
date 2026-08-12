/* ---------------------------------------------------------------------------
   Suspense fallbacks for the reading column.

   Each one is the silhouette of what replaces it: an eyebrow, a title at
   roughly two-thirds width, the byline row, then four paragraph lines that
   shorten toward the end. Nothing here shifts when the real content lands.

   Only the top three bands animate. The design pulses the elements that draw
   the eye first and leaves the body still, which reads as loading rather than
   as a flashing page.
   --------------------------------------------------------------------------- */

export function PageViewSkeleton() {
  return (
    <div className="reading-column flex flex-col gap-4" aria-hidden="true">
      <span className="skeleton h-2.25 w-13" />
      <span className="skeleton h-8.5 w-2/3" />

      <div className="flex items-center gap-2.5">
        <span className="skeleton size-5.5 rounded-full" />
        <span className="skeleton h-2.25 w-20" />
        <span className="skeleton h-2.25 w-28 opacity-60" />
      </div>

      <div className="mt-1.5 flex flex-col gap-2.25">
        {["w-full", "w-24/25", "w-22/25", "w-2/5"].map((w) => (
          <span key={w} className={`h-2.75 rounded-chip bg-raised ${w}`} />
        ))}
      </div>
    </div>
  );
}

export function CollectionViewSkeleton() {
  return (
    <div className="reading-column flex flex-col gap-4.5" aria-hidden="true">
      <span className="skeleton h-2.25 w-20" />
      <div className="flex items-start gap-3.5">
        <span className="skeleton size-14 flex-none rounded-panel" />
        <div className="flex flex-1 flex-col gap-2.5">
          <span className="skeleton h-8.5 w-3/5" />
          <span className="h-2.75 w-4/5 rounded-chip bg-raised" />
        </div>
      </div>
    </div>
  );
}

/** The PAGES tab while a child list loads. */
export function ChildPageListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-2.75 px-3 py-3.25">
          <span className="skeleton size-3.75 flex-none rounded-chip" />
          <span className="skeleton h-2.5 w-44" />
          <span className="skeleton ml-auto h-2.25 w-24 opacity-60" />
        </div>
      ))}
    </div>
  );
}
