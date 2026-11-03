import { Suspense } from "react";
import { RepositoryBrowser, type RepositoryRow } from "@/components/dashboard/repository-browser";
import { listAnalyses } from "@/lib/analyses";

async function Repositories({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // `/?add` arrives from the map's repository menu, asking for the form straight away.
  const [analyses, params] = await Promise.all([listAnalyses(), searchParams]);
  const rows: RepositoryRow[] = analyses.map((a) => ({
    id: a.id,
    repo: a.project ? `${a.project.repo_owner}/${a.project.repo_name}` : "(unknown repository)",
    branch: a.branch,
    status: a.status,
    stage: a.stage,
    message: a.status === "failed" ? a.error : a.stage_message,
    files: a.file_count,
    packages: a.package_count,
    stale: a.stale,
  }));
  return <RepositoryBrowser rows={rows} focus={params.add !== undefined} />;
}

export default function WorkspacePage({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense
        fallback={
          <div className="px-4 py-10 text-center text-xs text-muted">
            Loading repositories…
          </div>
        }
      >
        <Repositories searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
