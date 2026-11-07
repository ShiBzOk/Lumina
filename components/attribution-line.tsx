import type { Attribution } from "@/lib/when";

/**
 * "mapped by Ada, 2h ago", with the exact time on hovering the relative one.
 * An analysis from before authors were recorded reads "mapped 2h ago": no name
 * is guessed for it. Fixed at what the page was loaded with; it doesn't tick.
 */
export function AttributionLine({ attribution, className }: { attribution: Attribution; className?: string }) {
  const { verb, by, at } = attribution;
  return (
    <span className={className}>
      {verb}
      {by !== null ? ` by ${by}, ` : " "}
      <span data-tip={at.exact} aria-label={`${at.relative}, ${at.exact}`}>
        {at.relative}
      </span>
    </span>
  );
}
