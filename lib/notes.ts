import { connection } from "next/server";
import { readAll } from "@/lib/analyses";
import type { Note } from "@/lib/map/notes";
import { createServerSupabase } from "@/lib/supabase";
import { when } from "@/lib/when";

// Notes are written by people and read by people. Nothing that builds a model
// input may import this file or lib/map/notes.ts: an explanation has to come
// from the parser and the code alone, and a note is a second, unverified
// input. Keep it that way.

/**
 * Every note of a repository, newest first, read as the person asking. No
 * organization filter here: the policy returns only their organization's rows,
 * and a repository of another organization simply has none. Paged in full
 * rather than capped, because a note silently left off is worse than a slow
 * open.
 */
export async function loadNotes(projectId: string): Promise<Note[]> {
  await connection();
  const supabase = createServerSupabase();
  const rows = await readAll("notes", (from, to, count) =>
    supabase
      .from("notes")
      .select("id, path, author_id, author_name, body, created_at, edited_at, written_version, content_hash", { count: count ? "exact" : undefined })
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    authorId: r.author_id,
    authorName: r.author_name,
    body: r.body,
    created: when(r.created_at, now),
    edited: r.edited_at === null ? null : when(r.edited_at, now),
    stamp: r.written_version !== null && r.content_hash !== null ? { version: r.written_version, contentHash: r.content_hash } : null,
  }));
}
