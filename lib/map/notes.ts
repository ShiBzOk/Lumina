// What a note is, with nothing that reads or writes one. Safe to import from
// the browser; the loading lives in lib/notes.ts.

import type { When } from "../when.ts";

/** The longest a note may be. The table enforces the same number. */
export const NOTE_LIMIT = 1000;

export interface Note {
  id: string;
  path: string;
  /** Who wrote it, so the browser can offer edit and delete on a person's own. The policy is what enforces it. */
  authorId: string;
  /** The name as it was when the note was written. */
  authorName: string;
  body: string;
  created: When;
  /** Set once the note has been changed after it was written. */
  edited: When | null;
  /**
   * The analysis version and the file's content hash it was last written
   * against, read from the stored analysis. Null for notes from before stamping.
   */
  stamp: { version: number; contentHash: string } | null;
}

/** How a note's file on the map on screen compares with the file it was written against. */
export type StampMatch = "same" | "differs" | "absent";

export function stampMatch(note: Note, current: { sha256: string } | undefined): StampMatch | null {
  if (note.stamp === null) return null;
  if (current === undefined) return "absent";
  return current.sha256 === note.stamp.contentHash ? "same" : "differs";
}

/** The paths that carry at least one note, for the mark on the map and in search. */
export function notedPaths(notes: readonly Note[]): Set<string> {
  return new Set(notes.map((n) => n.path));
}
