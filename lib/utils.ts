import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* ---------------------------------------------------------------------------
   `cn`, taught the Kortex token vocabulary.

   tailwind-merge decides which of two classes wins by putting them in a class
   group, and it derives those groups from Tailwind's *default* scale. Kortex
   replaces most of that scale with role names, and tailwind-merge cannot tell
   a role name apart from a colour name: given `text-item text-primary-
   foreground` it reads both as text colours, keeps the last one and silently
   deletes the other.

   That is not theoretical. Before this config, every primary button rendered
   with `text-primary-foreground` stripped -- dark body ink on a blue fill --
   and every Input lost its `text-item` size. The bug is invisible in review
   because the class string looks correct in the source and only the merged
   output is wrong.

   So: every custom token name that shares a prefix with a Tailwind class group
   has to be registered here. Adding a token to app/globals.css means adding it
   to the matching list below.
   --------------------------------------------------------------------------- */

/** Type roles from `@theme inline` -- these are sizes, not colours. */
const FONT_SIZES = [
  "micro",
  "eyebrow",
  "meta",
  "label",
  "ui",
  "item",
  "prose-sm",
  "body",
  "lead",
  "h3",
  "h2",
  "title-sm",
  "title-md",
  "title-lg",
  "display",
] as const;

/** Weights -- these are weights, not font families. */
const FONT_WEIGHTS = ["book", "mid"] as const;

const LEADINGS = ["title", "prose"] as const;

const TRACKINGS = ["title", "heading", "chip", "eyebrow"] as const;

const RADII = ["chip", "control", "card", "panel", "sheet"] as const;

/** Elevation roles -- these are shadows, not shadow colours. */
const SHADOWS = ["e1", "e2", "e3", "drag", "primary"] as const;

const DURATIONS = ["state", "expand"] as const;

const EASINGS = ["kortex"] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FONT_SIZES] }],
      "font-weight": [{ font: [...FONT_WEIGHTS] }],
      leading: [{ leading: [...LEADINGS] }],
      tracking: [{ tracking: [...TRACKINGS] }],
      rounded: [{ rounded: [...RADII] }],
      shadow: [{ shadow: [...SHADOWS] }],
      duration: [{ duration: [...DURATIONS] }],
      ease: [{ ease: [...EASINGS] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// This check can be removed, it is just for tutorial purposes
export const hasEnvVars =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
