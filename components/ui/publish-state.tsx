import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { publishState, publishStateLabel, type PublishState, type PublishStateInput } from "@/lib/visibility";

/* ---------------------------------------------------------------------------
   The single definition of Draft / Published / Hidden.

   Publish state appears in four places -- the sidebar tree icon, the page
   header chip, the child-page list and the breadcrumb trail -- and all four
   read from the two cvas below. Changing the Hidden colour is a one-line edit
   to --color-state-hidden in app/globals.css; nothing here hardcodes a hue.

   The design's grammar, worth preserving when editing:
     draft      dashed outline, no fill      -- provisional
     published  solid outline, filled        -- settled
     hidden     solid outline, no fill, muted ink -- present but unreachable
   --------------------------------------------------------------------------- */

const glyphVariants = cva("flex-none", {
  variants: {
    state: {
      draft: "text-state-draft",
      published: "text-state-published",
      hidden: "text-state-hidden",
    },
  },
  defaultVariants: { state: "draft" },
});

const glyphBodyVariants = cva("", {
  variants: {
    state: {
      draft: "fill-none glyph-dashed",
      published: "fill-state-published-fill",
      hidden: "fill-none",
    },
  },
  defaultVariants: { state: "draft" },
});

export interface PageGlyphProps extends Omit<React.ComponentProps<"svg">, "children"> {
  state: PublishState;
  /** Hides the ruled lines inside the glyph at small sizes, as the marketing tree does. */
  lines?: boolean;
}

/** The page icon. Sized by the caller through `size-*`. */
function PageGlyph({ state, lines = true, className, ...props }: PageGlyphProps) {
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden="true"
      data-state={state}
      className={cn(glyphVariants({ state }), "size-3.25", className)}
      {...props}
    >
      <rect
        x="2.5"
        y="1.5"
        width="9"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
        className={glyphBodyVariants({ state })}
      />
      {lines ? (
        <path d="M5 5.5h4M5 8h4M5 10.5h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      ) : null}
    </svg>
  );
}

/* ------------------------------------------------------------------------- */

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-label font-mid whitespace-nowrap",
  {
    variants: {
      state: {
        draft: "bg-state-draft-fill text-ink-5",
        published: "bg-state-published-fill text-state-published-ink",
        hidden: "bg-raised text-ink-5",
      },
    },
    defaultVariants: { state: "draft" },
  },
);

export interface PublishChipProps extends React.ComponentProps<"span">, VariantProps<typeof chipVariants> {
  state: PublishState;
}

/**
 * The page-header badge. Only Published carries a dot -- it is the one state
 * that means "live to the workspace", and the dot is what makes it scannable
 * next to the Unpublish button.
 */
function PublishChip({ state, className, ...props }: PublishChipProps) {
  return (
    <span data-state={state} className={cn(chipVariants({ state }), className)} {...props}>
      {state === "published" ? (
        <span aria-hidden="true" className="size-1.25 flex-none rounded-full bg-state-published" />
      ) : null}
      {publishStateLabel[state]}
    </span>
  );
}

/* ------------------------------------------------------------------------- */

export interface PublishWordProps extends React.ComponentProps<"span"> {
  state: PublishState;
}

/**
 * The plain word that sits at the end of a tree row or child-page row.
 *
 * Published renders nothing: the design deliberately keeps the tree quiet, so
 * only the two states that need explaining say anything. That decision lives
 * here rather than in every list that renders a row.
 */
function PublishWord({ state, className, ...props }: PublishWordProps) {
  if (state === "published") return null;
  return (
    <span
      data-state={state}
      className={cn("flex-none text-meta font-medium text-muted-foreground", className)}
      {...props}
    >
      {publishStateLabel[state]}
    </span>
  );
}

/* ------------------------------------------------------------------------- */

/** Convenience for the common case: a row that has the two source columns. */
function stateOf(page: PublishStateInput): PublishState {
  return publishState(page);
}

export { PageGlyph, PublishChip, PublishWord, stateOf, glyphVariants, chipVariants };
