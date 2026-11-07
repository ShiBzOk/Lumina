"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MODEL } from "@/lib/ai/client";
import { aggregate, explainFile, explainFolder, type FolderFile } from "@/lib/ai/explain";
import { getAnalysis, loadFileNeighbourhood, loadStructure } from "@/lib/analyses";
import type { ComparedAnalysis } from "@/lib/map/compare";
import { fold } from "@/lib/map/fold";
import { parseRepoInput, resolveCommit, type RepoRef, type ResolvedCommit } from "@/lib/pipeline/github";
import { runAnalysis } from "@/lib/pipeline/run";
import { STALE_AFTER_MS } from "@/lib/stages";
import { createServerSupabase, createWriterSupabase } from "@/lib/supabase";
import { readCoverage } from "@/parser/io";

export interface SubmitState {
  error: string | null;
  /** What was typed, so a rejected submission doesn't empty the form. */
  repo: string;
  /** A branch or a commit hash; empty for the default branch. */
  ref: string;
}

/** A re-map that GitHub refused before anything was created says why, where it was asked. */
export interface RemapState {
  error: string | null;
}

// The organization every write is filed under, read off the verified token.
// Nothing the browser sends can choose it.
async function organization() {
  const { orgId, sessionClaims } = await auth();
  const name = sessionClaims?.org_name;
  if (!orgId) throw new Error("No active organization on the session");
  if (!name) {
    throw new Error("Session token has no org_name claim. Add it in Clerk Dashboard → Sessions → Customize session token.");
  }
  return { orgId, name };
}

/**
 * A repository at a branch, a commit hash, or its default branch. Each commit
 * is analysed once: one already analysed lands on the existing analysis
 * without touching it, and only a new one starts a run.
 */
export async function submitRepository(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  const repoInput = String(form.get("repo") ?? "");
  const refInput = String(form.get("ref") ?? "").trim();
  const state = { repo: repoInput, ref: refInput };
  const repo = parseRepoInput(repoInput);
  if (!repo) return { ...state, error: "Enter a GitHub repository as owner/name or a github.com URL." };
  if (refInput && !/^[^\s~^:?*[\\]+$/.test(refInput)) return { ...state, error: `"${refInput}" isn't a valid branch name or commit hash.` };

  const { orgId, name } = await organization();
  const db = createWriterSupabase();

  const org = await db.from("organizations").upsert({ id: orgId, name }, { onConflict: "id" });
  if (org.error) throw new Error(`Could not record the organization: ${org.error.message}`);

  const project = await db
    .from("projects")
    .upsert({ org_id: orgId, repo_owner: repo.owner, repo_name: repo.name }, { onConflict: "org_id,repo_owner,repo_name", ignoreDuplicates: true });
  if (project.error) throw new Error(`Could not record the repository: ${project.error.message}`);
  const { data: projectRow, error: projectError } = await db
    .from("projects")
    .select("id")
    .eq("org_id", orgId)
    .eq("repo_owner", repo.owner)
    .eq("repo_name", repo.name)
    .single();
  if (projectError) throw new Error(`Could not read the repository back: ${projectError.message}`);

  const error = await analyse({ orgId, projectId: projectRow.id, repo, ref: refInput || null });
  return { ...state, error };
}

/** A new analysis of the same branch at its tip. If that commit was already analysed, it opens instead. */
export async function remapAnalysis(analysisId: string): Promise<RemapState> {
  const { orgId } = await organization();
  // Read as the user, so the policy decides whether this analysis is theirs.
  const analysis = await getAnalysis(analysisId);
  if (!analysis || !analysis.project) return { error: "No such analysis" };
  if (!analysis.branch) return { error: "This analysis was asked for by commit, so it has no branch to follow." };
  const repo = { owner: analysis.project.repo_owner, name: analysis.project.repo_name };
  return { error: await analyse({ orgId, projectId: analysis.project_id, repo, ref: analysis.branch }) };
}

/**
 * Resolves the commit first, so the row is inserted knowing it and the unique
 * constraint on (repository, commit) decides whether this is a new analysis.
 * Two people submitting the same commit at once still make one row. GitHub
 * refusing the lookup creates nothing and comes back as the reason, in its own
 * words. Redirects on success; returns only an error.
 */
async function analyse(target: { orgId: string; projectId: string; repo: RepoRef; ref: string | null }): Promise<string> {
  const { orgId, projectId, repo, ref } = target;
  let commit: ResolvedCommit;
  try {
    commit = await resolveCommit(repo, ref);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const db = createWriterSupabase();
  const described = await db.from("projects").update({ description: commit.description }).eq("id", projectId);
  if (described.error) throw new Error(`Could not record the description: ${described.error.message}`);

  const inserted = await db
    .from("analyses")
    .insert({ org_id: orgId, project_id: projectId, branch: commit.branch, commit_sha: commit.sha })
    .select("id")
    .single();
  if (inserted.error) {
    if (inserted.error.code !== "23505") throw new Error(`Could not start the analysis: ${inserted.error.message}`);
    const existing = await db.from("analyses").select("id").eq("project_id", projectId).eq("commit_sha", commit.sha).single();
    if (existing.error) throw new Error(`Could not find the existing analysis: ${existing.error.message}`);
    redirect(`/analyses/${existing.data.id}`);
  }

  const request = { analysisId: inserted.data.id, projectId, orgId, repo, commit: commit.sha, branch: commit.branch, attempt: 0 };
  after(() => runAnalysis(request));
  redirect(`/analyses/${inserted.data.id}`);
}

/**
 * Runs an analysis that didn't finish again: one that failed or stopped
 * responding, at the same commit, in the same row. Only its own partial rows
 * are cleared. A finished analysis is never re-run; a newer commit is a new
 * analysis. Refused while a run is live, so two runs never write into one
 * analysis; a stale run counts as no longer live.
 */
export async function rerunAnalysis(analysisId: string): Promise<void> {
  const { orgId } = await organization();
  // Read as the user, so the policy decides whether this analysis is theirs.
  const analysis = await getAnalysis(analysisId);
  if (!analysis || !analysis.project) throw new Error("No such analysis");
  const { repo_owner, repo_name } = analysis.project;
  const repo = { owner: repo_owner, name: repo_name };
  // Rows from before this phase that failed before reaching a commit have none
  // to run again at, so they start a new analysis the ordinary way.
  if (!analysis.commit_sha) {
    const error = await analyse({ orgId, projectId: analysis.project_id, repo, ref: analysis.branch });
    throw new Error(error);
  }

  // Claiming the next attempt is what fences off the previous run, which may
  // still be alive. Matching the attempt read here makes the claim a
  // compare-and-swap, so two re-runs racing still start one run.
  const db = createWriterSupabase();
  const current = await db.from("analyses").select("attempt").eq("id", analysis.id).single();
  if (current.error) throw new Error(`Could not read the analysis: ${current.error.message}`);
  const attempt = current.data.attempt + 1;

  const now = new Date();
  const cutoff = new Date(now.getTime() - STALE_AFTER_MS).toISOString();
  const { data, error } = await db
    .from("analyses")
    .update({
      status: "queued",
      stage: null,
      stage_message: null,
      error: null,
      finished_at: null,
      coverage: null,
      adapter: null,
      file_count: null,
      package_count: null,
      attempt,
      // Set outright: a stale queued row re-queued changes no status, stage or
      // message, so the trigger alone would leave it looking stale.
      stage_changed_at: now.toISOString(),
    })
    .eq("id", analysis.id)
    .eq("attempt", current.data.attempt)
    // A complete analysis is excluded outright: its stage stopped moving long
    // ago, so the staleness test alone would let it be wiped and re-run.
    .neq("status", "complete")
    .or(`status.eq.failed,stage_changed_at.lt.${cutoff}`)
    .select("id");
  if (error) throw new Error(`Could not restart the analysis: ${error.message}`);

  if (data.length > 0) {
    const commit = analysis.commit_sha;
    after(() =>
      runAnalysis({ analysisId: analysis.id, projectId: analysis.project_id, orgId, repo, commit, branch: analysis.branch, attempt }),
    );
  }
  redirect(`/analyses/${analysis.id}`);
}

export type ExplainSubject = { kind: "file"; path: string } | { kind: "node"; id: string };

export type ExplainResult =
  | {
      ok: true;
      body: string;
      /** Sentences the pass after the model removed because they named a file it wasn't shown. */
      removedSentences: number;
      cached: boolean;
      model: string;
    }
  | { ok: false; error: string };

/**
 * Explains a file or a folded folder from the stored graph. The browser names
 * only the subject; every neighbour handed to the model is read back from the
 * rows the parser wrote, as the member asking.
 */
export async function explain(analysisId: string, subject: ExplainSubject): Promise<ExplainResult> {
  try {
    const { orgId } = await organization();
    const analysis = await getAnalysis(analysisId);
    if (!analysis || !analysis.project) return { ok: false, error: "No such analysis" };
    if (analysis.status !== "complete" || !analysis.commit_sha) {
      return { ok: false, error: "The analysis isn't complete, so there is nothing to explain yet" };
    }
    const repo = { owner: analysis.project.repo_owner, name: analysis.project.repo_name };
    const commit = analysis.commit_sha;
    const dbs = { reader: createServerSupabase(), writer: createWriterSupabase(), orgId, analysisId: analysis.id };

    // A file needs only its own rows and its neighbours'. Reading the whole
    // graph for it made every click, cached or not, cost a full map load.
    if (subject.kind === "file") {
      const file = await loadFileNeighbourhood(analysis, subject.path);
      if (!file) return { ok: false, error: `${subject.path} is not in this analysis` };
      if (file.kind === "asset") return { ok: false, error: "Assets aren't parsed, so there is nothing to explain from." };
      const result = await explainFile(dbs, {
        repo,
        commit,
        path: file.path,
        sha256: file.sha256,
        role: file.role,
        imports: file.imports,
        importedBy: file.importedBy,
        externals: file.externals,
      });
      return { ok: true, ...result.value, cached: result.cached, model: MODEL };
    }

    // A folder is folded from every path, but needs no import rows.
    const graph = await loadStructure(analysis);
    const labelOf = new Map(graph.labels.map((l) => [l.path, l.role]));
    // The same folding the map draws, over the same rows, so the folder asked about is the box clicked.
    const { nodes, nodeOf } = fold(graph.files);
    const node = nodes.find((n) => n.id === subject.id);
    if (!node) return { ok: false, error: `${subject.id} is not a folder on this map` };
    const inside = new Set(node.files);
    const importedFrom = new Map<string, { folder: string; count: number }[]>();
    const importsFrom: { folder: string; count: number }[] = [];
    let internal = 0;
    for (const e of graph.edges) {
      const from = inside.has(e.from);
      const to = inside.has(e.to);
      if (from && to) internal += 1;
      else if (to) importedFrom.set(e.to, [...(importedFrom.get(e.to) ?? []), { folder: nodeOf.get(e.from) ?? ".", count: 1 }]);
      else if (from) importsFrom.push({ folder: nodeOf.get(e.to) ?? ".", count: 1 });
    }
    const byPath = new Map(graph.files.map((f) => [f.path, f]));
    const files: FolderFile[] = node.files.flatMap((p) => {
      const f = byPath.get(p);
      return f
        ? [{ path: p, sha256: f.sha256, role: f.role ?? labelOf.get(p) ?? null, lines: f.lines, fanIn: f.fanIn, fanOut: f.fanOut, importedFrom: aggregate(importedFrom.get(p) ?? []) }]
        : [];
    });
    const result = await explainFolder(dbs, { repo, folder: node.id, files, importsFrom: aggregate(importsFrom), internal });
    return { ok: true, ...result.value, cached: result.cached, model: MODEL };
  } catch (error) {
    // Returned rather than thrown: a thrown message is hidden in production, and this one is the user's to read.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export type CompareSideResult = { ok: true; side: ComparedAnalysis } | { ok: false; error: string };

/**
 * The other side of a comparison: another finished analysis of the same
 * repository as the one on screen, which is already in the browser. The
 * comparison itself is worked out there, from what this returns.
 */
export async function loadCompareSide(headId: string, baseId: string): Promise<CompareSideResult> {
  try {
    const [head, base] = await Promise.all([getAnalysis(headId), getAnalysis(baseId)]);
    if (!head || !base) return { ok: false, error: "No such analysis" };
    if (base.project_id !== head.project_id) return { ok: false, error: "Only analyses of the same repository can be compared" };
    if (base.status !== "complete" || !base.adapter || base.coverage === null) {
      return { ok: false, error: "That analysis isn't complete, so it has no map to compare" };
    }
    const { files, edges } = await loadStructure(base);
    const { skipped, excludedPaths } = readCoverage(base.coverage);
    return { ok: true, side: { adapter: base.adapter, files, edges, coverage: { skipped, excludedPaths } } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
