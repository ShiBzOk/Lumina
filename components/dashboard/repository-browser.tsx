"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { submitRepository, type SubmitState } from "@/app/analyses/actions";
import { Icon } from "@/components/map/icons";
import { formatCount, sameEvent, STAGE_LABEL, type AnalysisStage, type AnalysisStatus } from "@/lib/stages";
import { useAnalysisStage } from "@/lib/use-analysis-stage";

export interface RepositoryRow {
  id: string;
  repo: string;
  description: string | null;
  branch: string | null;
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  /** The stage message while running, the reason once failed. */
  message: string | null;
  files: number | null;
  packages: number | null;
  stale: boolean;
}

export function RepositoryBrowser({ rows }: { rows: RepositoryRow[] }) {
  const [query, setQuery] = useState("");
  // Open by default only when there is nothing else to do here.
  const [adding, setAdding] = useState(rows.length === 0);
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.repo.includes(q)) : rows;

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]">Repositories</h1>
          <p className="mt-0.5 text-xs text-muted">Select a repository to explore its module architecture or clone a new one.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-8 w-56 items-center gap-2 rounded-lg border border-border bg-surface px-2.5 text-xs focus-within:border-accent">
            <Icon name="search" className="size-3.5 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
            />
          </label>
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-border/70 px-3 text-xs font-medium text-foreground hover:bg-border"
          >
            <Icon name={adding ? "x" : "plus"} className="size-3.5" />
            {adding ? "Cancel" : "Add repository"}
          </button>
        </div>
      </header>

      {adding && <CloneForm />}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <p className="text-xs font-medium">No repositories yet</p>
          <p className="mt-1 text-xs text-muted">Paste a public GitHub repository above to map it.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-xs">
            <thead className="bg-background/60 text-[11px] text-muted">
              <tr>
                <th className="px-3.5 py-2 font-medium">Repository</th>
                <th className="w-20 px-3.5 py-2 font-medium">Files</th>
                <th className="w-20 px-3.5 py-2 font-medium">Packages</th>
                <th className="w-32 px-3.5 py-2 font-medium">Status</th>
                <th className="w-32 px-3.5 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <Row key={row.id} row={row} />
              ))}
              {shown.length === 0 && (
                <tr className="border-t border-border">
                  <td colSpan={5} className="px-3.5 py-6 text-center text-muted">
                    No repository matches “{query.trim()}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const EMPTY: SubmitState = { error: null, repo: "", branch: "" };

function CloneForm() {
  const [state, action, pending] = useActionState(submitRepository, EMPTY);
  return (
    <form action={action} className="rounded-xl border border-border bg-surface p-4">
      <label htmlFor="repo" className="text-xs font-medium">
        Clone from GitHub URL
      </label>
      <div className="mt-2 flex gap-2">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-2.5 focus-within:border-accent">
          <Icon name="github" className="size-3.5 text-muted" />
          <input
            id="repo"
            name="repo"
            required
            autoFocus
            defaultValue={state.repo}
            placeholder="owner/name or https://github.com/owner/name"
            className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted"
          />
        </div>
        <div className="flex h-9 w-36 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 font-mono text-[11px] focus-within:border-accent">
          <Icon name="branch" className="size-3.5 shrink-0 text-muted" />
          <span className="text-muted">branch:</span>
          <input
            name="branch"
            defaultValue={state.branch}
            placeholder="default"
            aria-label="Branch"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-surface hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Starting…" : "Index Repo"}
          <Icon name="arrowRight" className="size-3.5" />
        </button>
      </div>
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

function Row({ row }: { row: RepositoryRow }) {
  const initial = { status: row.status, stage: row.stage, message: row.message };
  const { event, unavailable } = useAnalysisStage(row.id, initial);
  // Any word from the run means it is alive, whatever the server thought.
  const stale = row.stale && sameEvent(event, initial);
  const done = event.status === "complete";

  let note: { text: string; className: string } | null = row.description ? { text: row.description, className: "text-muted" } : null;
  if (event.status === "failed") note = { text: event.message ?? "Failed without a reason", className: "text-danger" };
  else if (stale) note = { text: "No progress for over 10 minutes; the run has probably stopped.", className: "text-muted" };
  else if (unavailable) note = { text: "Live updates unavailable; refresh to see the latest stage.", className: "text-muted" };
  else if (!done && event.message) note = { text: event.message, className: "text-muted" };

  return (
    <tr className="border-t border-border">
      <td className="px-3.5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted">
            <Icon name="github" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-medium">{row.repo}</span>
              {row.branch && <span className="rounded bg-background px-1 font-mono text-[10px] text-muted ring-1 ring-border">{row.branch}</span>}
            </div>
            {note && <p className={`mt-0.5 truncate text-[11px] ${note.className}`}>{note.text}</p>}
          </div>
        </div>
      </td>
      <td className="px-3.5 py-2.5 font-mono text-[11px] tabular-nums">{done && row.files !== null ? formatCount(row.files) : <Dash />}</td>
      <td className="px-3.5 py-2.5 font-mono text-[11px] tabular-nums">{done && row.packages !== null ? formatCount(row.packages) : <Dash />}</td>
      <td className="px-3.5 py-2.5">
        <StatusPill status={event.status} stage={event.stage} stale={stale} />
      </td>
      <td className="px-3.5 py-2.5 text-right">
        <Link
          href={`/analyses/${row.id}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-[11px] font-medium ring-1 ring-border hover:bg-border/60"
        >
          {done ? "Open Canvas" : event.status === "failed" || stale ? "View" : "View progress"}
          <Icon name="arrowRight" className="size-3" />
        </Link>
      </td>
    </tr>
  );
}

function Dash() {
  return <span className="text-muted">—</span>;
}

// Colour says one thing: finished, going, or broken. Stale is deliberately not
// a colour of its own; it reads as "unknown", which is what it is.
function StatusPill({ status, stage, stale }: { status: AnalysisStatus; stage: AnalysisStage | null; stale: boolean }) {
  let label: string;
  let className: string;
  if (status === "complete") [label, className] = ["Ready", "border-success/30 bg-success/10 text-success"];
  else if (status === "failed") [label, className] = [stage ? `Failed · ${stage}` : "Failed", "border-danger/30 bg-danger/10 text-danger"];
  else if (stale) [label, className] = [`Stale · ${stage ?? status}`, "border-dashed border-muted/60 bg-background text-muted"];
  else if (status === "queued" || !stage) [label, className] = ["Queued", "border-border bg-background text-muted"];
  else [label, className] = [STAGE_LABEL[stage], "border-accent/30 bg-accent/10 text-accent"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${className}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
