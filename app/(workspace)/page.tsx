import { Suspense } from "react";
import { RepositoryBrowser, type RepositoryRow } from "@/components/dashboard/repository-browser";
import { listAnalyses } from "@/lib/analyses";

async function Repositories() {
  const analyses = await listAnalyses();
  const rows: RepositoryRow[] = analyses.map((a) => ({
    id: a.id,
    repo: a.project ? `${a.project.repo_owner}/${a.project.repo_name}` : "(unknown repository)",
    description: a.project?.description ?? null,
    branch: a.branch,
    status: a.status,
    stage: a.stage,
    message: a.status === "failed" ? a.error : a.stage_message,
    files: a.file_count,
    packages: a.package_count,
    stale: a.stale,
  }));
  return <RepositoryBrowser rows={rows} />;
}

export default function WorkspacePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <Suspense
        fallback={
          <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-xs text-muted">
            Loading repositories…
          </div>
        }
      >
        <Repositories />
      </Suspense>
    </div>
  );
}
