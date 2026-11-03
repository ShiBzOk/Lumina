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

export function RepositoryBrowser({ rows, focus }: { rows: RepositoryRow[]; focus: boolean }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.repo.includes(q)) : rows;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-4 py-12 sm:py-20">
      <h1 className="text-center text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">Map a repository</h1>
      <p className="mx-auto mt-2 max-w-md text-center text-[13px] text-muted">
        Paste a public GitHub repository. Lumina parses every import and draws the files and the connections between them.
      </p>

      <CloneForm autoFocus={focus || rows.length === 0} />

      {rows.length > 0 && (
        <section className="mt-10">
          <header className={`mb-3 flex items-center gap-3 ${rows.length > 4 ? "justify-between" : "justify-center"}`}>
            <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">Your repositories</h2>
            {rows.length > 4 && (
              <label className="flex h-7 w-40 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[11px] focus-within:border-accent">
                <Icon name="search" className="size-3 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter…"
                  aria-label="Filter repositories"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
                />
              </label>
            )}
          </header>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {shown.map((row) => (
              <Card key={row.id} row={row} />
            ))}
          </ul>
          {shown.length === 0 && <p className="py-6 text-center text-xs text-muted">No repository matches “{query.trim()}”.</p>}
        </section>
      )}
    </div>
  );
}

const EMPTY: SubmitState = { error: null, repo: "", branch: "" };

function CloneForm({ autoFocus }: { autoFocus: boolean }) {
  const [state, action, pending] = useActionState(submitRepository, EMPTY);
  return (
    <form action={action} className="mt-7">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/80 bg-surface p-2.5 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_8px_24px_-6px_rgb(16_24_40/0.08)] focus-within:border-accent">
        <div className="flex h-10 min-w-0 flex-[1_1_16rem] items-center gap-2.5 px-2.5">
          <Icon name="github" className="size-4 shrink-0 text-muted" />
          <input
            name="repo"
            required
            autoFocus={autoFocus}
            defaultValue={state.repo}
            aria-label="Repository"
            placeholder="owner/name or github.com URL"
            className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none placeholder:font-sans placeholder:text-muted"
          />
        </div>
        <div className="flex flex-1 gap-2 sm:flex-none">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 font-mono text-[11px] focus-within:border-accent sm:w-36 sm:flex-none">
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
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-5 shadow-[0_1px_2px_rgb(10_108_240/0.3)] text-[13px] font-semibold text-surface hover:bg-accent/90 disabled:opacity-60"
          >
            {pending ? "Starting…" : "Map it"}
            <Icon name="arrowRight" className="size-3.5" />
          </button>
        </div>
      </div>
      {state.error && <p className="mt-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

function Card({ row }: { row: RepositoryRow }) {
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

  const status = statusOf(event.status, event.stage, stale);

  return (
    <li>
      <Link
        href={`/analyses/${row.id}`}
        className="group flex items-center gap-3 rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-[0_1px_2px_rgb(16_24_40/0.04),0_2px_8px_-2px_rgb(16_24_40/0.06)] hover:border-accent/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={`size-1.5 shrink-0 rounded-full ${status.dot}`} title={status.label} aria-hidden />
            <span className="sr-only">{status.label}:</span>
            <span className="truncate font-mono text-xs font-medium">{row.repo}</span>
            {row.branch && <span className="shrink-0 font-mono text-[10px] text-muted">@{row.branch}</span>}
          </div>
          <p className={`mt-0.5 truncate text-[11px] ${note?.className ?? "text-muted"}`}>{note?.text ?? status.label}</p>
        </div>
        {done && row.files !== null && (
          <span className="shrink-0 rounded-md bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted tabular-nums ring-1 ring-border/70">
            {formatCount(row.files)} files
          </span>
        )}
        <Icon name="arrowRight" className="size-3.5 shrink-0 text-muted group-hover:text-accent" />
      </Link>
    </li>
  );
}

// Colour says one thing: ready, going, or broken. Queued and stale stay grey;
// stale reads as "unknown", which is what it is.
function statusOf(status: AnalysisStatus, stage: AnalysisStage | null, stale: boolean): { label: string; dot: string } {
  if (status === "complete") return { label: "Ready", dot: "bg-success" };
  if (status === "failed") return { label: stage ? `Failed · ${stage}` : "Failed", dot: "bg-danger" };
  if (stale) return { label: `Stale · ${stage ?? status}`, dot: "bg-muted/60" };
  if (status === "queued" || !stage) return { label: "Queued", dot: "bg-muted/60" };
  return { label: STAGE_LABEL[stage], dot: "bg-accent" };
}
