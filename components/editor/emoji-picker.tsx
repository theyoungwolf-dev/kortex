"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/* ---------------------------------------------------------------------------
   The collection icon picker.

   Built on shadcn's Command inside a Popover so the search field, the
   type-ahead filtering, arrow-key navigation and Escape-to-close all come
   from cmdk and Radix rather than being re-implemented. The grid is a
   CommandGroup with a grid layout; cmdk keeps its own roving focus over the
   items regardless of how they are laid out.
   --------------------------------------------------------------------------- */

export interface EmojiPickerProps {
  value: string | null;
  choices: string[];
  onSelect?: (emoji: string | null) => void;
  /** Search keywords per emoji, so "compass" finds 🧭. */
  keywords?: Record<string, string>;
}

export function EmojiPicker({
  value,
  choices,
  onSelect,
  keywords = {},
}: EmojiPickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change collection icon"
          className="flex size-14 flex-none items-center justify-center rounded-panel border border-border-strong bg-canvas text-h2 leading-none transition-colors duration-state ease-kortex hover:bg-sidebar"
        >
          {value ?? "📁"}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-74 p-2.5">
        <Command>
          <CommandInput placeholder="Search icons" />
          <CommandList>
            <CommandEmpty>No icon matches that.</CommandEmpty>
            <CommandGroup className="grid grid-cols-7 gap-0.5">
              {choices.map((emoji) => (
                <CommandItem
                  key={emoji}
                  value={emoji}
                  keywords={keywords[emoji] ? [keywords[emoji]] : undefined}
                  data-selected-icon={emoji === value ? "" : undefined}
                  onSelect={() => {
                    onSelect?.(emoji);
                    setOpen(false);
                  }}
                  className="h-8 justify-center text-lead data-[selected-icon]:bg-primary-soft"
                >
                  {emoji}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>

        <div className="mt-2 flex items-center justify-between border-t border-background px-1 pt-2">
          <span className="text-meta text-muted-foreground">Recently used</span>
          <Button
            variant="link"
            size="md"
            className="h-auto px-0"
            onClick={() => {
              onSelect?.(null);
              setOpen(false);
            }}
          >
            Remove icon
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
