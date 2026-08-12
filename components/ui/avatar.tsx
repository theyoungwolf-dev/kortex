import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import type { ActorRef } from "@/lib/types";

/* ---------------------------------------------------------------------------
   Identity chips.

   Deliberately not shadcn's Avatar: that primitive exists to manage image
   loading and fallback, and Kortex never shows an uploaded image here -- the
   design uses initials on one of two tinted grounds throughout. The two-tone
   rotation lives in the `avatar-chip` utility so no consumer writes a ternary
   over colours.
   --------------------------------------------------------------------------- */

const avatarVariants = cva("avatar-chip", {
  variants: {
    size: {
      /* stacked reader avatars */
      xs: "size-5 text-micro",
      /* the byline beside a page title */
      sm: "size-5.5 text-micro",
      /* the workspace chip and account row */
      md: "size-7 text-meta",
      /* the member list in settings */
      lg: "size-7.5 text-meta",
    },
  },
  defaultVariants: { size: "md" },
});

export interface AvatarProps
  extends React.ComponentProps<"span">, VariantProps<typeof avatarVariants> {
  actor: Pick<ActorRef, "initials" | "tone" | "displayName">;
}

export function Avatar({ actor, size, className, ...props }: AvatarProps) {
  return (
    <span
      data-tone={actor.tone}
      title={actor.displayName}
      className={cn(avatarVariants({ size }), className)}
      {...props}
    >
      {actor.initials}
    </span>
  );
}

export interface AvatarStackProps {
  actors: ActorRef[];
  /** Total distinct readers; anything past `actors` becomes a +N chip. */
  total?: number;
  /** The surface the stack sits on, so the ring reads as a cutout. */
  ring?: "app" | "canvas" | "sidebar";
}

/**
 * Overlapping reader avatars. The ring is the page background rather than a
 * border colour, which is what makes the overlap read as depth.
 */
export function AvatarStack({ actors, total, ring = "app" }: AvatarStackProps) {
  const overflow = Math.max(0, (total ?? actors.length) - actors.length);
  const ringClass = {
    app: "ring-background",
    canvas: "ring-canvas",
    sidebar: "ring-sidebar",
  }[ring];

  return (
    <span className="flex items-center">
      {actors.map((actor, i) => (
        <Avatar
          key={actor.id}
          actor={actor}
          size="xs"
          className={cn("ring-2", ringClass, i > 0 && "-ml-1.5")}
        />
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            "-ml-1.5 flex size-5 flex-none items-center justify-center rounded-full bg-raised text-micro font-semibold text-ink-5 ring-2",
            ringClass,
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
