"use client";

import * as React from "react";

import { EmojiPicker } from "@/components/editor/emoji-picker";

/**
 * The collection icon, holding its own optimistic value.
 *
 * Uncontrolled for the same reason the inline title is: it keeps the
 * collection view a Server Component. `onCommit` is where a debounced
 * `.update({ icon })` goes.
 */
export interface CollectionIconProps {
  defaultValue: string | null;
  choices: string[];
  onCommit?: (icon: string | null) => void;
}

export function CollectionIcon({
  defaultValue,
  choices,
  onCommit,
}: CollectionIconProps) {
  const [icon, setIcon] = React.useState(defaultValue);

  return (
    <EmojiPicker
      value={icon}
      choices={choices}
      onSelect={(next) => {
        setIcon(next);
        onCommit?.(next);
      }}
    />
  );
}
