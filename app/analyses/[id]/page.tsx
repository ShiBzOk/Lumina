import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingAnalysis } from "@/components/analysis/loading";
import { AnalysisProgress } from "@/components/analysis/progress";
import { MapWorkspace } from "@/components/map/map-workspace";
import { WorkspaceHeader } from "@/components/workspace-header";
import { getAnalysis, listProjectAnalyses, listRepositories, loadGraph } from "@/lib/analyses";
import { PageTransition } from "@/components/page-transition";
import type { AnalysisStatus } from "@/lib/stages";

export const metadata: Metadata = { title: "Analysis · Lumina" };

// When an analysis was asked for, in the server's own time zone: this is a
// local app, so that is the reader's. Formatted here so the browser never
// renders it differently.
const RAN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// One address for an analysis from start to finish: its progress while it
// runs, its map once stored. A finished run refreshes this page into the map.
async function Analysis({ params }: { params: PageProps<"/analyses/[id]">["params"] }) {
  const { id } = await params;
  // The repository switcher's list doesn't depend on this analysis, so it is read alongside it.
  const [analysis, repositories] = await Promise.all([getAnalysis(id), listRepositories()]);
  if (!analysis || !analysis.project) notFound();
  const repo = `${analysis.project.repo_owner}/${analysis.project.repo_name}`;

  if (analysis.status === "complete") {
    if (!analysis.commit_sha || !analysis.adapter) {
      throw new Error(`Analysis ${analysis.id} is complete but has no commit or adapter recorded`);
    }
    const [{ files, edges, imports, routes, routesWithheld, coverage, labels }, history] = await Promise.all([
      loadGraph(analysis),
      listProjectAnalyses(analysis.project_id),
    ]);
    const option = (a: { id: string; commit_sha: string | null; branch: string | null; status: AnalysisStatus; created_at: string }) => ({
      id: a.id,
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
        meta={{ analysisId: analysis.id, repo, branch: analysis.branch, commit: analysis.commit_sha }}
        repositories={repositories.map((r) => ({ id: r.open, repo: r.repo, branch: r.branch, status: r.status }))}
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

export default function AnalysisPage({ params }: PageProps<"/analyses/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<LoadingAnalysis />}>
        <Analysis params={params} />
      </Suspense>
    </PageTransition>
  );
}
