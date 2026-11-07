import { getAnalysis } from "@/lib/analyses";
import type { HeadCheck } from "@/lib/head-check";
import { headCommit } from "@/lib/pipeline/github";

export async function checkHead(analysisId: string): Promise<HeadCheck> {
  try {
    // Read as the user, so the policy decides whether this analysis is theirs.
    const analysis = await getAnalysis(analysisId);
    if (!analysis || !analysis.project) return { state: "unknown", reason: "No such analysis" };
    if (analysis.status !== "complete" || !analysis.commit_sha) return { state: "unknown", reason: "The analysis isn't complete" };
    if (!analysis.branch) return { state: "unknown", reason: "It was asked for by commit, so there is no branch to follow" };
    const head = await headCommit({ owner: analysis.project.repo_owner, name: analysis.project.repo_name }, analysis.branch);
    return head === analysis.commit_sha ? { state: "current" } : { state: "moved", head };
  } catch (error) {
    return { state: "unknown", reason: error instanceof Error ? error.message : String(error) };
  }
}
