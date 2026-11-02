import { connection } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// No organization filter here, on purpose. Which rows come back is decided by
// the policy reading the org claim off the token; if another organization's
// row ever appears, the policy is what's wrong.
export async function listAnalyses() {
  // supabase-js fetches the token the moment the client is built. Waiting for
  // the request first keeps that out of prerendering, where there is no token.
  await connection();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, status, commit_sha, error, created_at, finished_at, project:projects!analyses_project_id_org_id_fkey(repo_owner, repo_name)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Could not list analyses: ${error.message}`);
  return data;
}

export type AnalysisListItem = Awaited<ReturnType<typeof listAnalyses>>[number];
