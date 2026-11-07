import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { RepositoryBrowser, type RepositoryRow } from "@/components/dashboard/repository-browser";
import { Landing } from "@/components/landing/landing";
import { WorkspaceHeader } from "@/components/workspace-header";
import { listRepositories } from "@/lib/analyses";
import { PageTransition } from "@/components/page-transition";

async function Repositories({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  // `/?add` arrives from the map's repository menu, asking for the form straight away.
  const [repositories, params, { orgId }] = await Promise.all([listRepositories(), searchParams, auth()]);
  // One row per repository, describing its latest analysis.
  const rows: RepositoryRow[] = repositories.map((a) => ({
    id: a.id,
    open: a.open,
    repo: a.repo,
    branch: a.branch,
    commit: a.commit_sha,
    status: a.status,
    stage: a.stage,
    message: a.status === "failed" ? a.error : a.stage_message,
    files: a.file_count,
    packages: a.package_count,
    stale: a.stale,
  }));
  // Keyed by organization, so switching mounts a fresh list, which settles in
  // rather than being swapped under the pointer.
  return <RepositoryBrowser key={orgId} rows={rows} focus={params.add !== undefined} />;
}

// The one address that is both front door and workspace. Signed out, it's the
// landing page; signed in, the proxy has already made sure there's an
// organization, so this is the repositories list.
async function Home({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { userId } = await auth();
  if (!userId) return <Landing />;

  return (
    <div className="flex min-h-screen flex-col">
      <WorkspaceHeader />
      <main className="flex flex-1 flex-col">
        <Suspense fallback={<div className="px-4 py-10 text-center text-xs text-muted">Loading repositories…</div>}>
          <Repositories searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

// Who's asking is request data, so it waits behind a boundary like any other.
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <PageTransition>
      <Suspense fallback={<div className="min-h-screen bg-surface" />}>
        <Home searchParams={searchParams} />
      </Suspense>
    </PageTransition>
  );
}
