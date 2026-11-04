import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingAnalysis } from "@/components/analysis/loading";
import { AnalysisProgress } from "@/components/analysis/progress";
import { MapWorkspace } from "@/components/map/map-workspace";
import { WorkspaceHeader } from "@/components/workspace-header";
import { MODEL, tracing } from "@/lib/ai/client";
import { getAnalysis, listAnalyses, loadGraph } from "@/lib/analyses";
import { PageTransition } from "@/components/page-transition";

export const metadata: Metadata = { title: "Analysis · Lumina" };

// One address for an analysis from start to finish: its progress while it
// runs, its map once stored. A finished run refreshes this page into the map.
async function Analysis({ params }: { params: PageProps<"/analyses/[id]">["params"] }) {
  const { id } = await params;
  // The repository switcher's list doesn't depend on this analysis, so it is read alongside it.
  const [analysis, analyses] = await Promise.all([getAnalysis(id), listAnalyses()]);
  if (!analysis || !analysis.project) notFound();
  const repo = `${analysis.project.repo_owner}/${analysis.project.repo_name}`;

  if (analysis.status === "complete") {
    if (!analysis.branch || !analysis.commit_sha || !analysis.adapter) {
      throw new Error(`Analysis ${analysis.id} is complete but has no branch, commit or adapter recorded`);
    }
    const { files, edges, imports, routes, routesWithheld, coverage, labels } = await loadGraph(analysis);
    // Only what the browser needs crosses over; everything the panes show is derived from these.
    return (
      <MapWorkspace
        meta={{ analysisId: analysis.id, repo, branch: analysis.branch, commit: analysis.commit_sha }}
        repositories={analyses.map((a) => ({
          id: a.id,
          repo: a.project ? `${a.project.repo_owner}/${a.project.repo_name}` : "(unknown repository)",
          branch: a.branch,
          status: a.status,
        }))}
        adapter={analysis.adapter}
        files={files}
        edges={edges}
        imports={imports}
        routes={routes}
        routesWithheld={routesWithheld}
        coverage={coverage}
        labels={labels}
        model={MODEL}
        tracing={tracing}
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
