/**
 * Date formatting for labels the panes render.
 *
 * Deliberately locale-fixed ("en-GB") and UTC rather than using the viewer's
 * locale. These strings are produced during a server render and compared
 * against a client render during hydration, so anything that varies by timezone
 * or locale mismatches and React re-renders it. `profiles.timezone` and
 * `profiles.locale` exist to do this properly once copy moves to `next-intl`.
 */
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const relativeFormatter = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

/**
 * "3 days ago". Computed against the server's clock at render time.
 *
 * Note this is not reactive: a page left open overnight keeps yesterday's
 * wording until something re-renders it. That is the accepted trade for not
 * shipping a ticking client component into every row.
 */
export function formatRelative(iso: string): string {
  const elapsed = new Date(iso).getTime() - Date.now();
  const magnitude = Math.abs(elapsed);

  for (const [unit, ms] of UNITS) {
    if (magnitude >= ms) return relativeFormatter.format(Math.round(elapsed / ms), unit);
  }

  return relativeFormatter.format(Math.round(elapsed / 1000), "second");
}
