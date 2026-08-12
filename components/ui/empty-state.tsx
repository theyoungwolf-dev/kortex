import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const emptyStateVariants = cva("flex flex-col items-center justify-center gap-3.5 text-center", {
  variants: {
    size: {
      /* A tab body or an inline region. */
      sm: "px-6 py-12",
      /* A whole pane: a collection with no pages, or a 404. */
      lg: "px-6 py-24",
    },
  },
  defaultVariants: { size: "lg" },
});

export interface EmptyStateProps
  extends Omit<React.ComponentProps<"div">, "title">, VariantProps<typeof emptyStateVariants> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, body, action, size, className, ...props }: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ size }), className)} {...props}>
      {icon}
      <div className="flex flex-col items-center gap-1.25">
        <p className="font-display text-lead font-semibold text-ink">{title}</p>
        {body ? <p className="max-w-70 text-ui leading-relaxed text-ink-4">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** The oversized dashed page outline the empty-collection state uses. */
export function EmptyPageGlyph() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" className="size-8.5 text-separator">
      <rect
        x="2.5"
        y="1.5"
        width="9"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1"
        className="glyph-dashed"
      />
    </svg>
  );
}
