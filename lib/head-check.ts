/** Whether the branch an analysis was mapped from has commits since. */
export type HeadCheck =
  | { state: "current" }
  | { state: "moved"; head: string }
  /** The check itself couldn't run; said rather than assumed either way. */
  | { state: "unknown"; reason: string };

/** What the head route sent, checked rather than trusted, since it crossed the network as JSON. */
export function readHeadCheck(body: unknown): HeadCheck | null {
  if (typeof body !== "object" || body === null || !("state" in body)) return null;
  if (body.state === "current") return { state: "current" };
  if (body.state === "moved" && "head" in body && typeof body.head === "string") return { state: "moved", head: body.head };
  if (body.state === "unknown" && "reason" in body && typeof body.reason === "string") return { state: "unknown", reason: body.reason };
  return null;
}
