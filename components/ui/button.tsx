import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Every button shape in the design lives here as a variant. The design uses
 * buttons at five weights of emphasis (primary, outline, quiet-icon, ghost,
 * link) and two destructive forms; nothing outside this file should be
 * reconstructing a button out of border + padding classes.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap",
    "rounded-control font-mid transition-colors duration-state ease-kortex outline-none",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border border-border-strong bg-canvas text-ink hover:bg-sidebar",
        /* The bordered icon buttons in the page header: star, overflow. */
        quiet:
          "border border-border bg-canvas text-muted-foreground hover:text-ink",
        /* Chromeless controls inside the sidebar and tree rows. */
        ghost: "text-muted-foreground hover:bg-raised hover:text-ink",
        link: "text-primary hover:text-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-danger-hover",
        "destructive-outline":
          "border border-danger-border bg-canvas text-danger-ink hover:bg-danger-soft",
      },
      size: {
        /* Tree-row affordances: the +, the drag handle, the row overflow. */
        xs: "size-5 rounded-chip [&_svg:not([class*='size-'])]:size-3",
        /* Sidebar header icons. */
        sm: "size-6.5 rounded-chip",
        /* Page-header controls, both text and icon. */
        md: "h-7.5 px-3 text-label",
        icon: "size-7.5",
        /* The product default: Publish, Cancel, Add the first page. */
        default: "px-3.75 py-2.25 text-ui",
        /* Full-width form submits and the marketing calls to action. */
        lg: "px-5 py-3.5 text-item font-semibold",
        /* The circular add button that straddles the tab strip. */
        fab: "size-9 rounded-full shadow-primary [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
