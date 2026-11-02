"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getAnalysis } from "@/lib/analyses";
import { parseRepoInput } from "@/lib/pipeline/github";
import { runAnalysis } from "@/lib/pipeline/run";
import { STALE_AFTER_MS } from "@/lib/stages";
import { createWriterSupabase } from "@/lib/supabase";

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

  const request = { analysisId: inserted.data.id, projectId: projectRow.id, orgId, repo, branch: branchInput || null };
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

  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data, error } = await createWriterSupabase()
    .from("analyses")
    .update({ status: "queued", stage: null, stage_message: null, error: null, finished_at: null, coverage: null, adapter: null, file_count: null, package_count: null })
    .eq("id", analysis.id)
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
      }),
    );
  }
  redirect(`/analyses/${analysis.id}`);
}
