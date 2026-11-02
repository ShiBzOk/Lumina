import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { listAnalyses, type AnalysisListItem } from "@/lib/analyses";
import type { AnalysisStatus } from "@/lib/database.types";

// Read straight off the session token during server rendering. The proxy has
// already guaranteed an organization is present.
async function CurrentOrganization() {
  const { orgId, sessionClaims } = await auth();
  const name = sessionClaims?.org_name;
  if (!orgId || !name) {
    throw new Error(
      "Session token has no org_name claim. Add it in Clerk Dashboard → Sessions → Customize session token.",
    );
  }
  return (
    <p className="mt-0.5 text-xs text-muted">
      Analyses belonging to{" "}
      <span className="font-medium text-foreground">{name}</span>{" "}
      <span className="font-mono text-[11px]">{orgId}</span>
    </p>
  );
}

// Timestamps are shown in UTC so the server render and every reader agree.
function formatTime(iso: string | null) {
  if (!iso) return "—";
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

// Colour here says one thing: whether the run finished, is going, or broke.
const statusStyle: Record<AnalysisStatus, { label: string; className: string }> = {
  complete: {
    label: "Complete",
    className: "border-success/30 bg-success/10 text-success",
  },
  running: {
    label: "Running",
    className: "border-accent/30 bg-accent/10 text-accent",
  },
  queued: {
    label: "Queued",
    className: "border-border bg-background text-muted",
  },
  failed: {
    label: "Failed",
    className: "border-danger/30 bg-danger/10 text-danger",
  },
};

function StatusPill({ status }: { status: AnalysisStatus }) {
  const { label, className } = statusStyle[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}

function RepoIcon() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted">
      <svg
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
        <path d="M9 18c-4.51 2-5-2-7-2" />
      </svg>
    </span>
  );
}

function AnalysisRow({ analysis }: { analysis: AnalysisListItem }) {
  return (
    <tr className="border-t border-border">
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-3">
          <RepoIcon />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-medium">
                {analysis.project.repo_owner}/{analysis.project.repo_name}
              </span>
              {analysis.commit_sha && (
                <span className="rounded bg-background px-1 font-mono text-[10px] text-muted">
                  {analysis.commit_sha.slice(0, 7)}
                </span>
              )}
            </div>
            {analysis.error && (
              <p className="mt-0.5 text-[11px] text-danger">{analysis.error}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted tabular-nums">
        {formatTime(analysis.created_at)}
      </td>
      <td className="px-3.5 py-2.5 font-mono text-[11px] text-muted tabular-nums">
        {formatTime(analysis.finished_at)}
      </td>
      <td className="px-3.5 py-2.5 text-right">
        <StatusPill status={analysis.status} />
      </td>
    </tr>
  );
}

async function AnalysisList() {
  const analyses = await listAnalyses();

  if (analyses.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center">
        <p className="text-xs font-medium">No analyses yet</p>
        <p className="mt-1 text-xs text-muted">
          This organization hasn&apos;t analysed a repository.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-left text-xs">
        <thead className="bg-background/60 text-[11px] text-muted">
          <tr>
            <th className="px-3.5 py-2 font-medium">Repository</th>
            <th className="px-3.5 py-2 font-medium">Started (UTC)</th>
            <th className="px-3.5 py-2 font-medium">Finished (UTC)</th>
            <th className="px-3.5 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((analysis) => (
            <AnalysisRow key={analysis.id} analysis={analysis} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <header>
        <h1 className="text-lg font-semibold tracking-[-0.01em]">Analyses</h1>
        <Suspense fallback={<p className="mt-0.5 h-4" />}>
          <CurrentOrganization />
        </Suspense>
      </header>
      <Suspense
        fallback={
          <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-xs text-muted">
            Loading analyses…
          </div>
        }
      >
        <AnalysisList />
      </Suspense>
    </div>
  );
}
