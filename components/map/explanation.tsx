"use client";

import { rerunAnalysis, type ExplainResult, type Freshness } from "@/app/analyses/actions";
import type { Selection } from "@/lib/map/highlight";
import { Icon } from "./icons";
import { Prose } from "./prose";

/** What the pane knows about one subject's explanation. Kept by the workspace, so it outlives the selection. */
export type ExplainState = { status: "loading" } | { status: "error"; message: string } | ({ status: "done" } & Extract<ExplainResult, { ok: true }>);

export function explainKey(subject: NonNullable<Selection>): string {
  return subject.kind === "file" ? `file:${subject.path}` : `node:${subject.id}`;
}

interface ExplanationProps {
  analysisId: string;
  subject: NonNullable<Selection>;
  /** Neighbours the parser found, said before asking so it's clear what the model will be handed. */
  context: string;
  /** Why this subject can't be explained, or null when it can. */
  unexplainable: string | null;
  state: ExplainState | undefined;
  model: string;
  tracing: boolean;
  onExplain: () => void;
  files: ReadonlySet<string>;
  folders: ReadonlySet<string>;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}

export function Explanation({ analysisId, subject, context, unexplainable, state, model, tracing, onExplain, ...links }: ExplanationProps) {
  const noun = subject.kind === "file" ? "file" : "folder";
  return (
    <div className="flex min-h-full flex-col px-3 pt-3 pb-3">
      <p className="truncate font-mono text-[11px] font-semibold" dir="rtl" title={subject.kind === "file" ? subject.path : `${subject.id}/`}>
        <bdi>{subject.kind === "file" ? subject.path : subject.id === "." ? "./" : `${subject.id}/`}</bdi>
      </p>

      <div className="mt-2 flex-1">
        {unexplainable ? (
          <p className="text-[11px] text-muted">{unexplainable}</p>
        ) : state === undefined ? (
          <>
            <p className="text-[11px] leading-relaxed text-muted">{context}</p>
            <button
              type="button"
              onClick={onExplain}
              className="mt-2.5 rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white hover:bg-accent/90"
            >
              Explain this {noun}
            </button>
          </>
        ) : state.status === "loading" ? (
          <p className="text-[11px] text-muted">Explaining… {context}</p>
        ) : state.status === "error" ? (
          <>
            <div className="flex gap-1.5 rounded-md border border-border px-2.5 py-2 text-[11px]">
              <Icon name="alert" className="mt-0.5 size-3 shrink-0 text-muted" />
              <span className="min-w-0 break-words">{state.message}</span>
            </div>
            <button type="button" onClick={onExplain} className="mt-2 text-[11px] text-muted underline underline-offset-2 hover:text-foreground">
              Try again
            </button>
          </>
        ) : (
          <>
            <Stale analysisId={analysisId} noun={noun} freshness={state.freshness} branch={state.branch} commit={state.commit} />
            <Prose body={state.body} {...links} />
            <div className="mt-3 flex items-center gap-2 border-t border-border pt-2 font-mono text-[10px] text-muted">
              <span>{state.cached ? "From cache" : "Generated"}</span>·<span className="truncate">{state.model}</span>·
              <span title={state.commit}>{state.commit.slice(0, 7)}</span>
              <span className="flex-1" />
              <button type="button" onClick={onExplain} className="font-sans underline underline-offset-2 hover:text-foreground">
                Explain again
              </button>
            </div>
          </>
        )}
      </div>

      <p className="mt-4 text-[10px] leading-snug text-muted">
        {state?.status === "done" ? null : <>Model: <span className="font-mono">{model}</span>. </>}
        {tracing ? (
          "Calls are traced in LangSmith."
        ) : (
          <>
            Tracing is off: set <span className="font-mono">LANGSMITH_TRACING=true</span> and <span className="font-mono">LANGSMITH_API_KEY</span>. Calls
            still work, untraced.
          </>
        )}
      </p>
    </div>
  );
}

function Stale({ analysisId, noun, freshness, branch, commit }: { analysisId: string; noun: string; freshness: Freshness; branch: string; commit: string }) {
  if (freshness.state === "current") return null;
  const at = commit.slice(0, 7);
  const message =
    freshness.state === "unknown"
      ? `Couldn't check whether this is still current: ${freshness.reason}`
      : freshness.state === "changed"
        ? freshness.deleted
          ? `Stale: this file no longer exists on ${branch} (now ${freshness.head.slice(0, 7)}). This explains it as of ${at}.`
          : `Stale: this file has changed on ${branch} since ${at}, which is what this explains.`
        : noun === "file"
          ? `${branch} has moved past ${at} to ${freshness.head.slice(0, 7)}. This file is unchanged; files around it may not be.`
          : `${branch} has moved past ${at} to ${freshness.head.slice(0, 7)}. This explains the folder as of ${at}.`;
  return (
    <div className="mb-2.5 rounded-md border border-border bg-background px-2.5 py-2 text-[11px] leading-snug">
      <p className="flex gap-1.5">
        <Icon name="alert" className="mt-0.5 size-3 shrink-0 text-muted" />
        <span className="min-w-0 break-words">{message}</span>
      </p>
      {freshness.state !== "unknown" && (
        <form action={rerunAnalysis.bind(null, analysisId)} className="mt-1.5 pl-[18px]">
          <button type="submit" className="font-medium text-accent underline-offset-2 hover:underline">
            Re-analyse at the latest commit
          </button>
        </form>
      )}
    </div>
  );
}
