import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingAnalysis } from "@/components/analysis/loading";
import { MissingAnalysis } from "@/components/analysis/missing";
import { PageTransition } from "@/components/page-transition";
import { analysisPath, parseVersion } from "@/lib/analysis-path";
import { findAnalysis, listProjectAnalyses, repositoryMap } from "@/lib/analyses";
import { KEPT_ANALYSES, versionName } from "@/lib/stages";
import { AnalysisScreen } from "../../../analyses/analysis-screen";

export const metadata: Metadata = { title: "Analysis · Lumina" };

// An analysis by repository and version, the address people share. Read under
// the policy like everything else, so it resolves only in the owning organization.
async function Analysis({ params, searchParams }: PageProps<"/[owner]/[repo]/[version]">) {
  const { owner, repo, version: segment } = await params;
  const version = parseVersion(segment);
  if (version === null) notFound();
  const [found, address] = await Promise.all([findAnalysis(owner, repo, version), searchParams]);
  if (!found) notFound();
  if (found.kind === "found") {
    const { project } = found.analysis;
    if (!project) notFound();
    return <AnalysisScreen analysis={{ ...found.analysis, project }} address={address} />;
  }

  // The repository is this organization's, so saying what became of the version tells no one anything new.
  const latest = repositoryMap(await listProjectAnalyses(found.projectId), found.defaultBranch);
  const action = latest
    ? { href: analysisPath({ id: latest.id, owner: found.owner, name: found.name, version: latest.version }), label: `Open ${versionName(latest.version)}` }
    : undefined;
  const name = `${found.owner}/${found.name}`;
  return found.kind === "removed" ? (
    <MissingAnalysis title={`${versionName(version)} is no longer kept`} tryElsewhere={false} action={action}>
      A repository keeps its {KEPT_ANALYSES} most recent analyses, and {versionName(version)} of{" "}
      <span className="font-mono">{name}</span> was removed when newer ones finished. The link can&apos;t open it any more.
    </MissingAnalysis>
  ) : (
    <MissingAnalysis title={`No ${versionName(version)} yet`} tryElsewhere={false} action={action}>
      <span className="font-mono">{name}</span> hasn&apos;t been analysed that many times. Check the version number in the link.
    </MissingAnalysis>
  );
}

export default function AnalysisPage({ params, searchParams }: PageProps<"/[owner]/[repo]/[version]">) {
  return (
    <PageTransition>
      <Suspense fallback={<LoadingAnalysis />}>
        <Analysis params={params} searchParams={searchParams} />
      </Suspense>
    </PageTransition>
  );
}
