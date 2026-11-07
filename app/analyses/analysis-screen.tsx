import { AnalysisProgress } from "@/components/analysis/progress";
import { MapWorkspace } from "@/components/map/map-workspace";
import { WorkspaceHeader } from "@/components/workspace-header";
import { analysisPath } from "@/lib/analysis-path";
import { listProjectAnalyses, listRepositories, loadGraph, type Analysis } from "@/lib/analyses";
import type { Address } from "@/lib/map/view";
import type { AnalysisStatus } from "@/lib/stages";

// When an analysis was asked for, in the server's own time zone: this is a
// local app, so that is the reader's. Formatted here so the browser never
// renders it differently.
const RAN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * One analysis from start to finish: its progress while it runs, its map once
 * stored. A finished run refreshes the page into the map. Both addresses an
 * analysis can have render this.
 */
export async function AnalysisScreen({ analysis, address }: { analysis: Analysis & { project: NonNullable<Analysis["project"]> }; address: Address }) {
  const { repo_owner: owner, repo_name: name } = analysis.project;
  const repo = `${owner}/${name}`;

  if (analysis.status === "complete") {
    if (!analysis.commit_sha || !analysis.adapter) {
      throw new Error(`Analysis ${analysis.id} is complete but has no commit or adapter recorded`);
    }
    const [{ files, edges, imports, routes, routesWithheld, coverage, labels }, history, repositories] = await Promise.all([
      loadGraph(analysis),
      listProjectAnalyses(analysis.project_id),
      listRepositories(),
    ]);
    const option = (a: { id: string; version: number; commit_sha: string | null; branch: string | null; status: AnalysisStatus; created_at: string }) => ({
      id: a.id,
      path: analysisPath({ id: a.id, owner, name, version: a.version }),
      version: a.version,
      commit: a.commit_sha,
      branch: a.branch,
      status: a.status,
      ran: RAN.format(new Date(a.created_at)),
    });
    // The list is capped; the one being looked at is always in it.
    const analyses = history.some((a) => a.id === analysis.id) ? history.map(option) : [...history, analysis].map(option);
    // Only what the browser needs crosses over; everything the panes show is derived from these.
    return (
      <MapWorkspace
        // Each analysis opens on its own address; nothing carries over from the last one.
        key={analysis.id}
        meta={{ analysisId: analysis.id, repo, branch: analysis.branch, commit: analysis.commit_sha }}
        repositories={repositories.map((r) => ({ id: r.open, path: r.openPath, repo: r.repo, branch: r.branch, status: r.status }))}
        analyses={analyses}
        latest={history.find((a) => a.status === "complete")?.id ?? null}
        adapter={analysis.adapter}
        files={files}
        edges={edges}
        imports={imports}
        routes={routes}
        routesWithheld={routesWithheld}
        coverage={coverage}
        labels={labels}
        address={address}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />
      <main className="flex flex-1 flex-col">
        <AnalysisProgress
          id={analysis.id}
          repo={repo}
          branch={analysis.branch}
          commit={analysis.commit_sha}
          version={analysis.version}
          initial={{
            status: analysis.status,
            stage: analysis.stage,
            message: analysis.status === "failed" ? analysis.error : analysis.stage_message,
          }}
          stale={analysis.stale}
        />
      </main>
    </div>
  );
}

/** Search params back into a query string, for carrying a view across a redirect. */
export function queryOf(address: Address): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(address)) {
    if (typeof value === "string") q.append(key, value);
    else if (value) for (const v of value) q.append(key, v);
  }
  const s = q.toString();
  return s === "" ? "" : `?${s}`;
}
