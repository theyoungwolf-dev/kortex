"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * The upload bar on the image block: 4px tall, blue fill on a hairline track.
 *
 * The completed fraction is the one genuinely runtime-computed value in this
 * component, so it is written as a custom property and consumed by the
 * `progress-fill` utility rather than as an inline transform.
 */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        "relative h-1 w-full overflow-hidden rounded-full bg-border",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        style={{ "--progress": value ?? 0 } as React.CSSProperties}
        className="progress-fill"
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
