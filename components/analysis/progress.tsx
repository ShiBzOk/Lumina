"use client";

import Link from "next/link";
import { rerunAnalysis } from "@/app/analyses/actions";
import { Icon } from "@/components/map/icons";
import { sameEvent, STAGE_LABEL, STAGES, type StageEvent } from "@/lib/stages";
import { useAnalysisStage } from "@/lib/use-analysis-stage";

interface ProgressProps {
  id: string;
  repo: string;
  branch: string | null;
  commit: string | null;
  initial: StageEvent;
  stale: boolean;
}

// Names each stage as it happens. Nothing spins: a stage is pending, current,
// done or failed, and the current one carries the run's own message.
export function AnalysisProgress({ id, repo, branch, commit, initial, stale: staleAtRender }: ProgressProps) {
  const { event, unavailable } = useAnalysisStage(id, initial);
  // Any word from the run means it is alive, whatever the server thought.
  const stale = staleAtRender && sameEvent(event, initial);
  const current = event.stage === null ? -1 : STAGES.indexOf(event.stage);
  const failed = event.status === "failed";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground">
          <Icon name="arrowLeft" className="size-3" />
          Repositories
        </Link>
        <h1 className="mt-2 flex items-center gap-2 font-mono text-sm font-semibold">
          {repo}
          {branch && <span className="rounded bg-background px-1 text-[10px] font-normal text-muted ring-1 ring-border">{branch}</span>}
          {commit && <span className="text-[11px] font-normal text-muted">{commit.slice(0, 7)}</span>}
        </h1>
      </div>

      <ol className="rounded-xl border border-border bg-surface">
        {STAGES.map((stage, i) => {
          const state =
            event.status === "complete" || i < current
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
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <Icon name="alert" className="size-3.5" />
          Live updates are unavailable, so this page may be behind. Refresh to see the latest stage.
        </p>
      )}
      {event.status === "queued" && !stale &&<p className="text-[11px] text-muted">Queued; the run has not started yet.</p>}
      {failed && current === -1 && (
        <p className="text-[11px] text-danger">{event.message ?? "The run failed before it reached a stage."}</p>
      )}

      {(failed || stale) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <p className="text-[11px] text-muted">
            {failed
              ? "Nothing from this run was kept."
              : "No progress for over 10 minutes. The process running it has probably stopped."}
          </p>
          <form action={rerunAnalysis.bind(null, id)}>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ring-1 ring-border hover:bg-border/60"
            >
              <Icon name="refresh" className="size-3" />
              Run again
            </button>
          </form>
        </div>
      )}
    </div>
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
  return (
    <span
      className={`mt-px size-4 shrink-0 rounded-full border-2 ${state === "current" ? "border-accent bg-accent/15" : "border-border"}`}
    />
  );
}
