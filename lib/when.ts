// Times as the page shows them. Worked out once, on the server, when the page
// is rendered, and never again: "2h ago" stays "2h ago" until the next load.
// The server's time zone is the reader's, since this is a local app, and
// formatting here means the browser never renders it differently.

const EXACT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** A date and minute, for listing analyses and for hovering a relative time. */
export function exactTime(iso: string): string {
  return EXACT.format(new Date(iso));
}

export interface When {
  /** "2h ago". */
  relative: string;
  /** "7 Nov 2026, 14:03", shown on hover. */
  exact: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function when(iso: string, now: number): When {
  // A clock a little ahead of the database's still reads as just now, not the future.
  const ago = Math.max(0, now - Date.parse(iso));
  let relative: string;
  if (ago < MINUTE) relative = "just now";
  else if (ago < HOUR) relative = `${Math.floor(ago / MINUTE)}m ago`;
  else if (ago < DAY) relative = `${Math.floor(ago / HOUR)}h ago`;
  else if (ago < 30 * DAY) relative = `${Math.floor(ago / DAY)}d ago`;
  else if (ago < 365 * DAY) relative = `${Math.floor(ago / (30 * DAY))}mo ago`;
  else relative = `${Math.floor(ago / (365 * DAY))}y ago`;
  return { relative, exact: exactTime(iso) };
}

/** Who mapped an analysis and when, as one line. Analyses from before authors were recorded have no name. */
export interface Attribution {
  /** "mapped" once finished; "started" for a run that is still going or failed. */
  verb: "mapped" | "started";
  by: string | null;
  at: When;
}

export function attribution(
  a: { status: string; started_by_name: string | null; created_at: string; finished_at: string | null },
  now: number,
): Attribution {
  const finished = a.status === "complete" ? a.finished_at : null;
  return { verb: finished ? "mapped" : "started", by: a.started_by_name, at: when(finished ?? a.created_at, now) };
}
