// What a notification is, with nothing that reads or writes one. Safe to
// import from the browser; the reading lives in lib/notifications.ts.

import type { When } from "./when.ts";

/** How many the inbox lists when opened. Older ones are still counted, just not listed. */
export const INBOX_LIMIT = 30;

export type InboxEvent =
  | { kind: "note"; path: string; author: string }
  | {
      kind: "run_complete" | "run_failed";
      version: number;
      branch: string | null;
      /** A failure's reason as the run recorded it; null for a finished run. */
      reason: string | null;
      /** False once the analysis was pruned: the notification stays, the map doesn't. */
      kept: boolean;
    };

export interface InboxItem {
  id: string;
  read: boolean;
  at: When;
  repo: string;
  event: InboxEvent;
}
