/* ---------------------------------------------------------------------------
   The DETAILS tab: a definition list of the row behind the page.

   Server Component. Values arrive pre-formatted for the same reason the
   metadata row's do -- relative dates are clock-dependent.
   --------------------------------------------------------------------------- */

export interface DetailsEntry {
  label: string;
  value: React.ReactNode;
}

export interface DetailsTabProps {
  entries: DetailsEntry[];
}

export function DetailsTab({ entries }: DetailsTabProps) {
  return (
    <dl className="flex flex-col gap-3.5">
      {entries.map((entry) => (
        <div key={entry.label} className="flex items-baseline gap-6">
          <dt className="eyebrow w-32 flex-none">{entry.label}</dt>
          <dd className="min-w-0 flex-1 text-label text-ink-2">
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
