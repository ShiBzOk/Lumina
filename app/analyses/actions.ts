"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { MODEL } from "@/lib/ai/client";
import { aggregate, explainFile, explainFolder, type FolderFile } from "@/lib/ai/explain";
import { getAnalysis, loadFileNeighbourhood, loadStructure } from "@/lib/analyses";
import { fold } from "@/lib/map/fold";
import { parseRepoInput } from "@/lib/pipeline/github";
import { runAnalysis } from "@/lib/pipeline/run";
import { STALE_AFTER_MS } from "@/lib/stages";
import { createServerSupabase, createWriterSupabase } from "@/lib/supabase";

export interface SubmitState {
  error: string | null;
  /** What was typed, so a rejected submission doesn't empty the form. */
  repo: string;
  branch: string;
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
 * One analysis per repository. A URL already analysed lands on the existing
 * analysis without touching it; only a new one starts a run. The unique
 * constraint decides which case this is, so two tabs racing still make one row.
 */
export async function submitRepository(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  const repoInput = String(form.get("repo") ?? "");
  const branchInput = String(form.get("branch") ?? "").trim();
  const state = { repo: repoInput, branch: branchInput };
  const repo = parseRepoInput(repoInput);
  if (!repo) return { ...state, error: "Enter a GitHub repository as owner/name or a github.com URL." };
  if (branchInput && !/^[^\s~^:?*[\\]+$/.test(branchInput)) return { ...state, error: `"${branchInput}" isn't a valid branch name.` };

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

  const inserted = await db
    .from("analyses")
    .insert({ org_id: orgId, project_id: projectRow.id, branch: branchInput || null })
    .select("id")
    .single();

  if (inserted.error) {
    if (inserted.error.code !== "23505") throw new Error(`Could not start the analysis: ${inserted.error.message}`);
    const existing = await db.from("analyses").select("id").eq("project_id", projectRow.id).single();
    if (existing.error) throw new Error(`Could not find the existing analysis: ${existing.error.message}`);
    redirect(`/analyses/${existing.data.id}`);
  }

  const request = { analysisId: inserted.data.id, projectId: projectRow.id, orgId, repo, branch: branchInput || null, attempt: 0 };
  after(() => runAnalysis(request));
  redirect(`/analyses/${inserted.data.id}`);
}

/**
 * Re-running is a deliberate act from the analysis itself: the same row, its
 * previous rows cleared by the run. Refused while a run is live, so two runs
 * never write into one analysis; a stale run counts as no longer live.
 */
export async function rerunAnalysis(analysisId: string): Promise<void> {
  const { orgId } = await organization();
  // Read as the user, so the policy decides whether this analysis is theirs.
  const analysis = await getAnalysis(analysisId);
  if (!analysis || !analysis.project) throw new Error("No such analysis");

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
    .or(`status.in.(complete,failed),stage_changed_at.lt.${cutoff}`)
    .select("id");
  if (error) throw new Error(`Could not restart the analysis: ${error.message}`);

  if (data.length > 0) {
    const { repo_owner, repo_name } = analysis.project;
    after(() =>
      runAnalysis({
        analysisId: analysis.id,
        projectId: analysis.project_id,
        orgId,
        repo: { owner: repo_owner, name: repo_name },
        branch: analysis.branch,
        attempt,
      }),
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
    if (analysis.status !== "complete" || !analysis.commit_sha || !analysis.branch) {
      return { ok: false, error: "The analysis isn't complete, so there is nothing to explain yet" };
    }
    const repo = { owner: analysis.project.repo_owner, name: analysis.project.repo_name };
    const commit = analysis.commit_sha;
    const dbs = { reader: createServerSupabase(), writer: createWriterSupabase(), orgId };

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
