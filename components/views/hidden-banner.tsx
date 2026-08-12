import { Button } from "@/components/ui/button";

/* ---------------------------------------------------------------------------
   The one place Hidden is explained rather than merely stated.

   The tree keeps quiet about it -- a muted glyph and the word "Hidden" -- on
   the principle that the explanation belongs next to the action that resolves
   it. This banner names the ancestor that is blocking the page and offers to
   publish that ancestor, which is the only thing that will actually help.

   Server Component. The publish control is a form submit rather than an
   onClick, so it works before hydration and has somewhere obvious to attach a
   Server Action paired with revalidateTag.
   --------------------------------------------------------------------------- */

export interface HiddenBannerProps {
  blockingAncestor: { id: string; title: string };
  /** Rendered in place of the default button when the viewer cannot publish. */
  action?: React.ReactNode;
}

export function HiddenBanner({ blockingAncestor, action }: HiddenBannerProps) {
  return (
    <div className="flex items-center gap-2.5 rounded-card border border-border-soft bg-sidebar px-3 py-2.25">
      <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className="size-3.5 flex-none text-state-hidden">
        <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 4.2v3.4M7 9.4v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>

      <p className="text-label leading-normal text-ink-4">
        Published, but not yet reachable - <strong className="font-semibold text-ink">{blockingAncestor.title}</strong>{" "}
        is still a draft.
      </p>

      <div className="ml-auto flex-none">
        {action ?? (
          <Button variant="link" size="md" className="px-0.5">
            Publish {shortTitle(blockingAncestor.title)}
          </Button>
        )}
      </div>
    </div>
  );
}

/** "ADR-017 Realtime collaboration" -> "ADR-017", so the button stays short. */
function shortTitle(title: string): string {
  const [first] = title.split(" ");
  return first.length >= 4 ? first : title;
}
