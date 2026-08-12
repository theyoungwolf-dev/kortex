import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Small standing labels: member roles, the version chip, step counters.
 *
 * Publish state deliberately does NOT come through here -- Draft, Published
 * and Hidden have one definition in components/ui/publish-state.tsx so that
 * changing a state colour is a single edit.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap transition-colors duration-state ease-kortex [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        /* The role pill in the member list, and anything else stated quietly. */
        soft: "rounded-sm bg-secondary px-2.25 py-1.5 text-meta font-medium text-ink-4",
        /* Mono eyebrow chip: "v0.1 · early", "STEP 1 OF 1", "ROUND 2". */
        mono: "rounded-chip bg-secondary px-1.75 py-1 font-mono text-eyebrow font-semibold tracking-chip text-muted-foreground uppercase",
        solid:
          "rounded-chip bg-ink px-1.75 py-1 font-mono text-eyebrow font-semibold tracking-chip text-background uppercase",
        primary:
          "rounded-sm bg-primary-soft px-2.25 py-1.5 text-meta font-medium text-primary",
        outline:
          "rounded-sm border border-border px-2.25 py-1.5 text-meta font-medium text-ink-4",
        destructive:
          "rounded-sm bg-danger-soft px-2.25 py-1.5 text-meta font-medium text-danger-ink",
      },
    },
    defaultVariants: { variant: "soft" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
