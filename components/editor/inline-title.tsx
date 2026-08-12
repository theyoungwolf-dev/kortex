"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Editable text that does not look like a form field until you touch it.

   A textarea rather than a contenteditable div: it gives real undo, real
   spellcheck, real IME behaviour and a real accessible name, and
   `field-sizing-content` grows it to the text so it wraps exactly like the
   heading it stands in for.

   Uncontrolled by default. The caller supplies `defaultValue` and hears about
   changes through `onCommit`, which is what an autosave debounce wants -- a
   controlled version would force every consumer to be a client component just
   to hold a string.

   Enter is swallowed on the title: a page title is one line, and a newline
   here produces a title the tree cannot render.
   --------------------------------------------------------------------------- */

export interface InlineTitleProps {
  defaultValue: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  readOnly?: boolean;
  /** Collection names sit a step smaller than page titles. */
  size?: "page" | "collection";
}

export function InlineTitle({
  defaultValue,
  placeholder = "Untitled",
  onChange,
  onCommit,
  readOnly,
  size = "page",
}: InlineTitleProps) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <textarea
      rows={1}
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      placeholder={placeholder}
      aria-label={size === "page" ? "Page title" : "Collection name"}
      onChange={(event) => {
        setValue(event.target.value);
        onChange?.(event.target.value);
      }}
      onBlur={(event) => onCommit?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={cn(
        "field-sizing-content w-full resize-none border-0 bg-transparent p-0 font-display font-semibold tracking-title text-ink outline-none",
        "placeholder:text-state-hidden",
        "text-title-sm md:text-title-md xl:text-title-lg",
      )}
    />
  );
}

/* ------------------------------------------------------------------------- */

export interface InlineDescriptionProps {
  defaultValue: string;
  placeholder?: string;
  onCommit?: (value: string) => void;
  readOnly?: boolean;
}

/**
 * The collection description. The dashed underline is the affordance: it says
 * "this is editable" without turning the reading surface into a form.
 */
export function InlineDescription({
  defaultValue,
  placeholder = "Add a description",
  onCommit,
  readOnly,
}: InlineDescriptionProps) {
  const [value, setValue] = React.useState(defaultValue);

  return (
    <textarea
      rows={1}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label="Collection description"
      onChange={(event) => setValue(event.target.value)}
      onBlur={(event) => onCommit?.(event.target.value)}
      className={cn(
        "field-sizing-content w-full resize-none border-0 border-b border-dashed border-border-strong bg-transparent p-0 pb-2 text-body leading-relaxed text-ink-4 outline-none",
        "placeholder:text-state-hidden",
      )}
    />
  );
}
