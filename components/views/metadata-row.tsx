import { Avatar, AvatarStack } from "@/components/ui/avatar";
import type { ActorRef } from "@/lib/types";

/* ---------------------------------------------------------------------------
   The byline under a page title: who last edited it, when it was edited and
   created, and who has read it.

   Server Component. Timestamps arrive pre-formatted -- relative time is
   locale- and clock-dependent, and computing it here would either force the
   whole row to the client or produce a hydration mismatch.
   --------------------------------------------------------------------------- */

export interface MetadataRowProps {
  actor: ActorRef;
  /** Already humanised, e.g. "Edited 12 minutes ago". */
  editedLabel: string;
  createdLabel: string;
  readerCount: number;
  readers: ActorRef[];
}

export function MetadataRow({
  actor,
  editedLabel,
  createdLabel,
  readerCount,
  readers,
}: MetadataRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <span className="flex items-center gap-1.75">
        <Avatar actor={actor} size="sm" />
        <span className="text-label font-mid text-ink-2">
          {actor.displayName}
        </span>
      </span>

      <span aria-hidden="true" className="meta-divider" />
      <span className="text-label text-muted-foreground">{editedLabel}</span>

      <span aria-hidden="true" className="meta-divider" />
      <span className="text-label text-muted-foreground">{createdLabel}</span>

      {readerCount > 0 ? (
        <>
          <span aria-hidden="true" className="meta-divider" />
          <span className="flex items-center gap-1.5">
            <span className="text-label text-muted-foreground">
              {readerCount === 1 ? "1 reader" : `${readerCount} readers`}
            </span>
            <AvatarStack actors={readers} total={readerCount} />
          </span>
        </>
      ) : null}
    </div>
  );
}
