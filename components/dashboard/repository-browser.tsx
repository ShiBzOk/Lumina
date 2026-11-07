"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { submitRepository, type SubmitState } from "@/app/analyses/actions";
import { Icon } from "@/components/map/icons";
import { RemapButton, useHeadCheck } from "@/components/new-commits";
import { PetrolBand } from "@/components/petrol-band";
import { formatCount, sameEvent, STAGE_LABEL, type AnalysisStage, type AnalysisStatus } from "@/lib/stages";
import { useAnalysisStage } from "@/lib/use-analysis-stage";

/** A repository, described by its latest analysis. */
export interface RepositoryRow {
  /** The latest analysis. */
  id: string;
  /** Where opening the repository lands: the latest map, or a run in progress. */
  open: string;
  repo: string;
  /** Null when the latest analysis was asked for by commit. */
  branch: string | null;
  commit: string | null;
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
  const shown = q ? rows.filter((r) => r.repo.toLowerCase().includes(q)) : rows;
  const empty = rows.length === 0;

  return (
    <div className="flex flex-1 flex-col">
      <PetrolBand
        tall={empty}
        header={
          <>
            <p className="flex items-center gap-4 text-[11px] font-medium tracking-[0.2em] text-white uppercase">
              Dependency maps
              <span className="h-px w-24 bg-white/70" aria-hidden />
            </p>
            <h1
              className={`font-semibold tracking-[-0.035em] text-white ${empty ? "mt-6 text-5xl leading-[1.02] xl:text-6xl" : "mt-4 text-3xl leading-[1.05] sm:text-4xl"}`}
            >
              Map a repository
            </h1>
          </>
        }
      >
          <CloneForm autoFocus={focus || empty} />

          {empty ? (
            <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-muted">
              Paste a public GitHub repository. Every import is parsed, and every link on the map is one the code really
              makes.
            </p>
          ) : (
            <section className="border-t border-border transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0">
              <header className="flex h-9 items-center gap-2 bg-background px-4">
                <h2 className="text-[11px] font-semibold">Repositories</h2>
                <span className="font-mono text-[10px] text-muted tabular-nums">{rows.length}</span>
                <div className="flex-1" />
                {rows.length > 4 && (
                  <label className="flex h-6 w-40 items-center gap-1.5 rounded-md bg-surface px-2 text-[11px] ring-1 ring-border focus-within:ring-petrol/40">
                    <Icon name="search" className="size-3 text-muted" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Filter"
                      aria-label="Filter repositories"
                      className="min-w-0 flex-1 bg-transparent font-mono outline-none placeholder:font-sans placeholder:text-muted"
                    />
                  </label>
                )}
              </header>
              <ul className="border-t border-border">
                {shown.map((row) => (
                  <Row key={row.id} row={row} />
                ))}
                {shown.length === 0 && <li className="px-4 py-4 text-center text-[11px] text-muted">No match</li>}
              </ul>
            </section>
          )}
      </PetrolBand>
    </div>
  );
}

const EMPTY: SubmitState = { error: null, repo: "", ref: "" };

function CloneForm({ autoFocus }: { autoFocus: boolean }) {
  const [state, action, pending] = useActionState(submitRepository, EMPTY);
  return (
    <form action={action}>
      <div className="flex flex-wrap items-center">
        <label className="flex h-12 min-w-0 flex-[1_1_16rem] items-center gap-2.5 px-4">
          <Icon name="github" className="size-3.5 shrink-0 text-muted" />
          <input
            name="repo"
            required
            autoFocus={autoFocus}
            defaultValue={state.repo}
            aria-label="Repository"
            placeholder="owner/name or github.com URL"
            className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:font-sans placeholder:text-muted"
          />
        </label>
        <div className="flex flex-1 items-center gap-2 py-2 pr-2 pl-3 sm:flex-none sm:border-l sm:border-border">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[11px] sm:w-40 sm:flex-none">
            <Icon name="branch" className="size-3.5 shrink-0 text-muted" />
            <input
              name="ref"
              defaultValue={state.ref}
              placeholder="branch or commit"
              aria-label="Branch or commit"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-sans placeholder:text-muted"
            />
          </label>
          {/* Petrol rather than the map's blue, so the page reads as the same product as the login. */}
          <button
            type="submit"
            disabled={pending}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-petrol px-3.5 text-[11px] font-medium text-white hover:bg-petrol/90 disabled:opacity-60"
          >
            {pending ? "Starting…" : "Map it"}
            <Icon name="arrowRight" className="size-3" />
          </button>
        </div>
      </div>
      {state.error && <p className="border-t border-border px-4 py-2 text-[11px] text-danger">{state.error}</p>}
    </form>
  );
}

function Row({ row }: { row: RepositoryRow }) {
  const initial = { status: row.status, stage: row.stage, message: row.message };
  const { event, unavailable } = useAnalysisStage(row.id, initial);
  // Any word from the run means it is alive, whatever the server thought.
  const stale = row.stale && sameEvent(event, initial);
  const done = event.status === "complete";
  const failed = event.status === "failed";
  // Only a finished map of a branch has a commit to compare; one asked for by
  // commit follows no branch, and one still running is at a commit just resolved.
  const head = useHeadCheck(row.id, done && row.branch !== null);
  const moved = head?.state === "moved";

  // A ready row says nothing beyond its size; words only appear when it is not ready.
  let note: string | null = null;
  // A failed run with an earlier map behind it opens on that map, so the note says which run failed.
  if (failed) note = (row.open !== row.id ? "Latest run failed: " : "") + (event.message ?? "Failed");
  else if (stale) note = "Stopped responding";
  else if (!done) note = statusOf(event.stage, event.status) + (unavailable ? " · live updates off" : "");
  else if (moved) note = "New commits since this map";

  return (
    <li className="flex items-center border-t border-border first:border-t-0 hover:bg-background">
      <Link href={`/analyses/${row.open}`} className="group flex h-10 min-w-0 flex-1 items-center gap-3 px-4">
        <span className="min-w-0 truncate font-mono text-xs">{row.repo}</span>
        {row.branch && <span className="shrink-0 font-mono text-[10px] text-muted">{row.branch}</span>}
        {row.commit && <span className="shrink-0 font-mono text-[10px] text-muted">{row.commit.slice(0, 7)}</span>}
        <span className={`min-w-0 flex-1 truncate text-right text-[11px] ${failed ? "text-danger" : "text-muted"}`}>
          {note ?? (row.files !== null ? <span className="font-mono text-[10px] tabular-nums">{formatCount(row.files)} files</span> : null)}
        </span>
        <Icon name="arrowRight" className="size-3.5 shrink-0 text-muted group-hover:text-accent" />
      </Link>
      {/* Outside the link: re-mapping is its own act, not a way into the map. */}
      {moved && (
        <RemapButton
          analysisId={row.id}
          className="mr-3 h-6 rounded-md px-2 text-[11px] font-medium text-petrol ring-1 ring-petrol/30 hover:bg-petrol/5"
        />
      )}
    </li>
  );
}

function statusOf(stage: AnalysisStage | null, status: AnalysisStatus): string {
  return status === "queued" || !stage ? "Queued" : STAGE_LABEL[stage];
}
