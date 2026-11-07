"use client";

import Link from "next/link";
import { rerunAnalysis } from "@/app/analyses/actions";
import { Icon } from "@/components/map/icons";
import { PetrolBand } from "@/components/petrol-band";
import { Spinner } from "@/components/spinner";
import { sameEvent, STAGE_LABEL, STAGES, versionName, type StageEvent } from "@/lib/stages";
import { useAnalysisStage } from "@/lib/use-analysis-stage";
import { LoadingAnalysis } from "./loading";

interface ProgressProps {
  id: string;
  repo: string;
  branch: string | null;
  commit: string | null;
  version: number;
  initial: StageEvent;
  stale: boolean;
}

// Names each stage as it happens: pending, current, done or failed, and the
// current one carries the run's own message. The current one spins, because a
// long stage with a still mark looks stuck; its message, which the run updates
// with counts as it goes, is what says it isn't.
export function AnalysisProgress({ id, repo, branch, commit, version, initial, stale: staleAtRender }: ProgressProps) {
  const { event, unavailable } = useAnalysisStage(id, initial);
  // Any word from the run means it is alive, whatever the server thought.
  const stale = staleAtRender && sameEvent(event, initial);
  const current = event.stage === null ? -1 : STAGES.indexOf(event.stage);
  const failed = event.status === "failed";

  // The page refreshes into the map on its own, but a refresh is a transition:
  // React keeps this screen up while the server reads the graph back, so the
  // Suspense fallback never shows. The same loader is shown from here instead.
  if (event.status === "complete") return <LoadingAnalysis />;

  // Said in the card's header, so the list itself only has to show which stage is which.
  const summary = failed
    ? "Failed"
    : stale
      ? "Stopped responding"
      : event.status === "queued" || current === -1
        ? "Queued"
        : `${current + 1} of ${STAGES.length}`;

  return (
    <PetrolBand
      header={
        <>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.2em] text-white/80 uppercase hover:text-white"
          >
            <Icon name="arrowLeft" className="size-3" />
            Repositories
          </Link>
          <h1 className="mt-4 truncate text-3xl leading-[1.05] font-semibold tracking-[-0.035em] text-white sm:text-4xl">{repo}</h1>
          <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-white/75">
            <span className="font-sans" title={commit ?? undefined}>
              {versionName(version)}
            </span>
            {branch && <span className="rounded px-1.5 py-px ring-1 ring-white/30">{branch}</span>}
          </p>
        </>
      }
    >
      <header className="flex h-9 items-center gap-2 border-b border-border bg-background px-4">
        <h2 className="text-[11px] font-semibold">Mapping</h2>
        <div className="flex-1" />
        <span className={`font-mono text-[10px] tabular-nums ${failed ? "text-danger" : "text-muted"}`}>{summary}</span>
      </header>

      <ol>
        {STAGES.map((stage, i) => {
          const state =
            i < current
              ? "done"
              : i === current
                ? failed
                  ? "failed"
                  : "current"
                : "pending";
          return (
            <li key={stage} className="flex gap-3 border-t border-border px-4 py-3 first:border-t-0">
              <StageMark state={state} />
              <div className="min-w-0">
                <p className={`text-xs font-medium ${state === "pending" ? "text-muted" : ""}`}>{STAGE_LABEL[stage]}</p>
                {(state === "current" || state === "failed") && event.message && (
                  <p className={`mt-0.5 font-mono text-[11px] break-words ${state === "failed" ? "text-danger" : "text-muted"}`}>
                    {event.message}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {unavailable && (
        <p className="flex items-center gap-1.5 border-t border-border px-4 py-2.5 text-[11px] text-muted">
          <Icon name="alert" className="size-3.5" />
          Live updates are unavailable, so this page may be behind. Refresh to see the latest stage.
        </p>
      )}
      {event.status === "queued" && !stale && (
        <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted">Queued; the run has not started yet.</p>
      )}
      {failed && current === -1 && (
        <p className="border-t border-border px-4 py-2.5 text-[11px] text-danger">
          {event.message ?? "The run failed before it reached a stage."}
        </p>
      )}

      {(failed || stale) && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-2.5">
          <p className="text-[11px] text-muted">
            {failed
              ? "Nothing from this run was kept."
              : "No progress for over 10 minutes. The process running it has probably stopped."}
          </p>
          <form action={rerunAnalysis.bind(null, id)}>
            <button
              type="submit"
              className="flex h-7 items-center gap-1.5 rounded-lg bg-petrol px-3 text-[11px] font-medium whitespace-nowrap text-white hover:bg-petrol/90"
            >
              <Icon name="refresh" className="size-3" />
              Run again
            </button>
          </form>
        </div>
      )}
    </PetrolBand>
  );
}

function StageMark({ state }: { state: "done" | "current" | "failed" | "pending" }) {
  if (state === "done") {
    return (
      <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-surface">
        <Icon name="check" className="size-2.5" />
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-danger text-surface">
        <Icon name="x" className="size-2.5" />
      </span>
    );
  }
  if (state === "current") return <Spinner className="mt-px size-4" />;
  return <span className="mt-px size-4 shrink-0 rounded-full border-2 border-border" />;
}
