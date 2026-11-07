import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingAnalysis } from "@/components/analysis/loading";
import { PageTransition } from "@/components/page-transition";
import { analysisPath } from "@/lib/analysis-path";
import { getAnalysis } from "@/lib/analyses";
import { AnalysisScreen, queryOf } from "../analysis-screen";

export const metadata: Metadata = { title: "Analysis · Lumina" };

// The address an analysis had before it had a readable one. Links already
// sent still work: they land on the readable address with their view intact.
// Only a repository whose owner shares a name with a page of the app stays here.
async function Analysis({ params, searchParams }: PageProps<"/analyses/[id]">) {
  const { id } = await params;
  const [analysis, address] = await Promise.all([getAnalysis(id), searchParams]);
  if (!analysis || !analysis.project) notFound();
  const path = analysisPath({ id: analysis.id, owner: analysis.project.repo_owner, name: analysis.project.repo_name, version: analysis.version });
  if (path !== `/analyses/${analysis.id}`) redirect(path + queryOf(address));
  return <AnalysisScreen analysis={{ ...analysis, project: analysis.project }} address={address} />;
}

export default function AnalysisPage({ params, searchParams }: PageProps<"/analyses/[id]">) {
  return (
    <PageTransition>
      <Suspense fallback={<LoadingAnalysis />}>
        <Analysis params={params} searchParams={searchParams} />
      </Suspense>
    </PageTransition>
  );
}
