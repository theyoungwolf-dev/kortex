import type { CollectionViewData } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The collection surface: icon, name, description, then the same panel the
   page view uses.

   Server Component. The icon picker and the editable name/description are
   slots, because all three are interactive and this scaffold is not.
   --------------------------------------------------------------------------- */

export interface CollectionViewProps {
  collection: CollectionViewData;
  /** The emoji picker trigger. Client. */
  icon: React.ReactNode;
  /** The inline-editable name. Client. */
  title: React.ReactNode;
  /** The inline-editable description. Client. */
  description: React.ReactNode;
  panel?: React.ReactNode;
}

export function CollectionView({
  icon,
  title,
  description,
  panel,
}: CollectionViewProps) {
  return (
    <section className="reading-column flex flex-col gap-4.5">
      <span className="eyebrow">Collection</span>

      <div className="flex items-start gap-3.5">
        {icon}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          {title}
          {description}
        </div>
      </div>

      {panel ? <div className="mt-6">{panel}</div> : null}
    </section>
  );
}
