/* ---------------------------------------------------------------------------
   The Suspense fallback for the sidebar tree.

   It holds the exact shape of what loads -- section eyebrows, a collection
   row, indented children -- so the tree does not jump when it arrives. The
   design's rule for skeletons is that they are the silhouette of the real
   thing, not a generic grey box.
   --------------------------------------------------------------------------- */

const GROUPS = [
  { label: "w-20", rows: [1, 1, 1] },
  { label: "w-26", rows: [0, 1, 0] },
  { label: "w-36", rows: [0, 1, 2, 2, 1] },
];

const ROW_WIDTHS = ["w-30", "w-40", "w-24", "w-35", "w-28"];

export function SidebarSkeleton() {
  return (
    <div className="flex h-full flex-col bg-sidebar" aria-hidden="true">
      <div className="flex flex-none items-center gap-2 border-b border-border-soft py-3 pr-3 pl-3.5">
        <span className="skeleton size-6.5 rounded-card" />
        <span className="skeleton h-2.5 w-24" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 pt-2.5">
        {GROUPS.map((group, g) => (
          <div key={g} className="flex flex-col gap-1">
            <span
              className={`skeleton mt-3.5 mb-1.25 ml-2 h-2 ${group.label}`}
            />
            {group.rows.map((depth, r) => (
              <div
                key={r}
                style={{ "--depth": depth } as React.CSSProperties}
                className="tree-row gap-2"
              >
                <span className="skeleton size-3.25 flex-none rounded-chip" />
                <span
                  className={`skeleton h-2.25 ${ROW_WIDTHS[(g + r) % ROW_WIDTHS.length]}`}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2.25 border-t border-border-soft px-3 py-2.75">
        <span className="skeleton size-7 rounded-full" />
        <span className="flex flex-col gap-1">
          <span className="skeleton h-2.25 w-16" />
          <span className="skeleton h-2 w-28" />
        </span>
      </div>
    </div>
  );
}
