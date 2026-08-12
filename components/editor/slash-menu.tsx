"use client";

import * as React from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The slash-command menu.

   Tiptap's Suggestion plugin owns *when* this appears and where it is
   anchored; this component is only the popup. It is built on cmdk so the
   filtering and keyboard navigation match the icon picker and any future
   command palette, rather than being a third hand-rolled list.

   Rendered without a Popover on purpose: the suggestion plugin positions its
   own element, and nesting Radix's portal inside that fights it.
   --------------------------------------------------------------------------- */

export interface SlashCommandItem {
  id: string;
  label: string;
  /** The mono affordance in the leading column: "H1", "1.", or an icon. */
  glyph: React.ReactNode;
  keywords?: string[];
  group?: string;
}

export interface SlashMenuProps {
  items: SlashCommandItem[];
  query?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

export function SlashMenu({
  items,
  query,
  onSelect,
  className,
}: SlashMenuProps) {
  const groups = React.useMemo(() => {
    const byGroup = new Map<string, SlashCommandItem[]>();
    for (const item of items) {
      const key = item.group ?? "Blocks";
      byGroup.set(key, [...(byGroup.get(key) ?? []), item]);
    }
    return [...byGroup];
  }, [items]);

  return (
    <Command
      value={query}
      className={cn(
        "w-72 rounded-card border border-border bg-popover p-1.5 shadow-e2",
        className,
      )}
    >
      <CommandList className="max-h-88">
        <CommandEmpty>No block matches that.</CommandEmpty>
        {groups.map(([group, groupItems]) => (
          <CommandGroup key={group} heading={group}>
            {groupItems.map((item) => (
              <CommandItem
                key={item.id}
                value={item.label}
                keywords={item.keywords}
                onSelect={() => onSelect?.(item.id)}
                className="gap-2.75 px-2.5 py-2"
              >
                <span className="flex w-5 flex-none items-center justify-start font-mono text-label font-medium text-muted-foreground">
                  {item.glyph}
                </span>
                <span className="text-ui font-medium text-ink">
                  {item.label}
                </span>
                <kbd className="ml-auto font-mono text-meta text-muted-foreground opacity-0 group-data-[selected=true]/item:opacity-100">
                  ↵
                </kbd>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

/** The block set the design draws, in its order. */
export const defaultSlashItems: SlashCommandItem[] = [
  { id: "h1", label: "Heading 1", glyph: "H1", keywords: ["title"] },
  { id: "h2", label: "Heading 2", glyph: "H2" },
  { id: "h3", label: "Heading 3", glyph: "H3" },
  { id: "bulletList", label: "Bullet list", glyph: <BulletGlyph /> },
  { id: "orderedList", label: "Numbered list", glyph: "1." },
  {
    id: "blockquote",
    label: "Quote",
    glyph: <span className="font-display text-lead">”</span>,
  },
  { id: "image", label: "Image", glyph: <ImageGlyph />, keywords: ["photo"] },
  {
    id: "divider",
    label: "Divider",
    glyph: <DividerGlyph />,
    keywords: ["hr"],
  },
];

function BulletGlyph() {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="size-3.5"
    >
      <circle cx="2.5" cy="3.5" r="1.1" fill="currentColor" />
      <circle cx="2.5" cy="7" r="1.1" fill="currentColor" />
      <circle cx="2.5" cy="10.5" r="1.1" fill="currentColor" />
      <path
        d="M6 3.5h7M6 7h7M6 10.5h7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ImageGlyph() {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="size-3.5"
    >
      <rect
        x="1"
        y="2.5"
        width="12"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M1.6 9.4l3-3 2.4 2.4 2-2 3.4 3.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DividerGlyph() {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="size-3.5"
    >
      <path
        d="M1 7h12"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}
