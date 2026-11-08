import { connection } from "next/server";
import { analysisPath } from "@/lib/analysis-path";
import { listProjectAnalyses, repositoryMap } from "@/lib/analyses";
import { INBOX_LIMIT, type InboxItem } from "@/lib/inbox";
import { writeView, DEFAULT_VIEW } from "@/lib/map/view";
import { createServerSupabase } from "@/lib/supabase";
import { when } from "@/lib/when";

// Notifications are read by people, never by a model. Like notes, nothing
// that builds a model input may import this file.
//
// No recipient or organization filter anywhere here: the policy returns only
// the person's own, in the organization they are signed into.

async function reader() {
  await connection();
  return createServerSupabase();
}

/** How many of the person's notifications are unread. A count, no rows. */
export async function unreadCount(): Promise<number> {
  const supabase = await reader();
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw new Error(`Could not count notifications: ${error.message}`);
  if (count === null) throw new Error("Counting notifications returned no count");
  return count;
}

/** The person's newest notifications, newest first, at most INBOX_LIMIT. */
export async function listInbox(): Promise<InboxItem[]> {
  const supabase = await reader();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, repo_owner, repo_name, path, actor_name, analysis_id, version, branch, reason, created_at, read_at")
    .order("created_at", { ascending: false })
    .order("id")
    .limit(INBOX_LIMIT);
  if (error) throw new Error(`Could not read notifications: ${error.message}`);
  const now = Date.now();
  return data.map((r) => {
    const base = { id: r.id, read: r.read_at !== null, at: when(r.created_at, now), repo: `${r.repo_owner}/${r.repo_name}` };
    if (r.kind === "note") {
      if (r.path === null || r.actor_name === null) throw new Error(`Notification ${r.id} is a note without its path or author`);
      return { ...base, event: { kind: r.kind, path: r.path, author: r.actor_name } };
    }
    if (r.version === null) throw new Error(`Notification ${r.id} is a run without its version`);
    return { ...base, event: { kind: r.kind, version: r.version, branch: r.branch, reason: r.reason, kept: r.analysis_id !== null } };
  });
}

export type Opened = { ok: true; href: string } | { ok: false; error: string };

/**
 * Marks one notification read and says where it leads. A note leads to the
 * map its repository opens on, with the file selected and its Notes tab
 * showing; when that map doesn't have the path, to the Notes tab's list of
 * notes no longer in the analysis. A run leads to its own analysis address,
 * which shows its map, its failure, or that the version is no longer kept.
 */
export async function openNotification(id: string): Promise<Opened> {
  const supabase = await reader();
  // The policy shows another person's notification to no update, so it comes back empty.
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .select("kind, project_id, repo_owner, repo_name, path, analysis_id, version")
    .maybeSingle();
  if (error) throw new Error(`Could not open the notification: ${error.message}`);
  if (!data) return { ok: false, error: "That notification is gone." };
  const owner = data.repo_owner;
  const name = data.repo_name;

  if (data.kind !== "note") {
    if (data.version === null) throw new Error(`Notification ${id} is a run without its version`);
    // A pruned analysis has no id left; its version address says it is no longer kept.
    return { ok: true, href: analysisPath({ id: data.analysis_id ?? "", owner, name, version: data.version }) };
  }

  if (data.path === null) throw new Error(`Notification ${id} is a note without its path`);
  const project = await supabase.from("projects").select("default_branch").eq("id", data.project_id).maybeSingle();
  if (project.error) throw new Error(`Could not read the repository: ${project.error.message}`);
  if (!project.data) return { ok: false, error: `${owner}/${name} is no longer mapped.` };
  const map = repositoryMap(await listProjectAnalyses(data.project_id), project.data.default_branch);
  if (!map) return { ok: false, error: `${owner}/${name} has no finished map to open.` };

  const file = await supabase.from("files").select("id").eq("analysis_id", map.id).eq("path", data.path).maybeSingle();
  if (file.error) throw new Error(`Could not read the file: ${file.error.message}`);
  const view = { ...DEFAULT_VIEW, tab: "notes" as const, selection: file.data ? { kind: "file" as const, path: data.path } : null };
  return { ok: true, href: analysisPath({ id: map.id, owner, name, version: map.version }) + writeView(view) };
}

/** Marks every unread notification of the person read. */
export async function markAllRead(): Promise<void> {
  const supabase = await reader();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) throw new Error(`Could not mark notifications read: ${error.message}`);
}
