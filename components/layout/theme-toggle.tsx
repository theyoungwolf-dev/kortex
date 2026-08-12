"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/* ---------------------------------------------------------------------------
   The Light / Dark / System segmented control.

   Renders a placeholder until mounted: next-themes cannot know the resolved
   theme during SSR, and marking the wrong segment for one frame is the kind
   of flicker the design's 120ms state transition makes very visible.
   --------------------------------------------------------------------------- */

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  return (
    <ToggleGroup
      type="single"
      value={mounted ? theme : undefined}
      onValueChange={(value) => value && setTheme(value)}
      aria-label="Appearance"
      className="flex w-fit gap-0.5 rounded-card bg-raised p-0.75"
    >
      {OPTIONS.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="rounded-sm px-2.75 py-1.75 text-label font-mid text-muted-foreground transition-colors duration-state ease-kortex data-[state=on]:bg-canvas data-[state=on]:text-ink"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
