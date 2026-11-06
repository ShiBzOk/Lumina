"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ExplainResult } from "@/app/analyses/actions";
import type { Selection } from "@/lib/map/highlight";
import { Icon, type IconName } from "./icons";
import { Prose } from "./prose";

/** What the pane knows about one subject's explanation. Kept by the workspace, so it outlives the selection. */
export type ExplainState =
  | { status: "loading"; since: number }
  | { status: "error"; message: string }
  | ({ status: "done" } & Extract<ExplainResult, { ok: true }>);

/** One thing the model is given. A count is how many the parser found; in and out are coloured as on the map. */
export interface Handed {
  icon: IconName;
  label: string;
  count?: number;
  tone?: "in" | "out";
}

export function explainKey(subject: NonNullable<Selection>): string {
  return subject.kind === "file" ? `file:${subject.path}` : `node:${subject.id}`;
}

interface ExplanationProps {
  subject: NonNullable<Selection>;
  /** What the model is given, said before asking so it's clear what it works from. */
  handed: Handed[];
  /** Why this subject can't be explained, or null when it can. */
  unexplainable: string | null;
  state: ExplainState | undefined;
  onExplain: () => void;
  files: ReadonlySet<string>;
  folders: ReadonlySet<string>;
  hovered: Selection;
  onSelect: (s: Selection) => void;
  onHover: (s: Selection) => void;
}

export function Explanation({ subject, handed, unexplainable, state, onExplain, ...links }: ExplanationProps) {
  const noun = subject.kind === "file" ? "file" : "folder";
  return (
    <div className="flex min-h-full flex-col px-3 pt-3 pb-3">
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background text-muted ring-1 ring-border">
          <Icon name={subject.kind === "file" ? "fileCode" : "folder"} className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] leading-3 text-muted capitalize">{noun}</p>
          <p className="truncate font-mono text-[11px] leading-4 font-semibold" dir="rtl" title={subject.kind === "file" ? subject.path : `${subject.id}/`}>
            <bdi>{subject.kind === "file" ? subject.path : subject.id === "." ? "./" : `${subject.id}/`}</bdi>
          </p>
        </div>
      </div>

      <div className="mt-3 flex-1">
        {unexplainable ? (
          <p className="rounded-md bg-background px-2.5 py-2 text-[11px] text-muted ring-1 ring-border">{unexplainable}</p>
        ) : state === undefined ? (
          <>
            <HandedList items={handed} />
            <button
              type="button"
              onClick={onExplain}
              className="mt-2.5 w-full rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-[scale] duration-100 hover:bg-accent/90 active:scale-[0.98]"
            >
              Explain this {noun}
            </button>
          </>
        ) : state.status === "loading" ? (
          <Waiting noun={noun} since={state.since} handed={handed} />
        ) : state.status === "error" ? (
          <>
            <div className="flex gap-2 rounded-md border border-danger/25 bg-danger/5 px-2.5 py-2 text-[11px] leading-snug">
              <Icon name="alert" className="mt-px size-3.5 shrink-0 text-danger" />
              <div className="min-w-0">
                <p className="font-medium text-danger">The explanation didn&apos;t come back</p>
                <p className="mt-0.5 break-words text-foreground/80">{state.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onExplain}
              className="mt-2 flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
            >
              <Icon name="refresh" className="size-3" /> Try again
            </button>
          </>
        ) : (
          // Arrives as a whole, so it fades in as one rather than appearing mid-thought.
          <div className="transition-opacity duration-300 ease-out starting:opacity-0">
            <Prose body={state.body} {...links} />
            {state.removedSentences > 0 ? (
              // Said, not hidden: the reader should know the text is shorter than what the model wrote, and why.
              <p className="mt-2 text-[10px] leading-snug text-muted">
                {state.removedSentences === 1 ? "1 sentence" : `${state.removedSentences} sentences`} removed: named a file the model
                wasn&apos;t given.
              </p>
            ) : null}
            <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-2 font-mono text-[10px] text-muted">
              {/* Kept: it's how a working cache is told from a broken one. */}
              <Tag>{state.cached ? "From cache" : "Generated"}</Tag>
              <span className="flex-1" />
              <button type="button" onClick={onExplain} className="flex items-center gap-1 font-sans hover:text-foreground" title="Ask the model again">
                <Icon name="refresh" className="size-3" /> Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Laid out like the Structure tab's lists, so the two tabs read as one pane.
function HandedList({ items }: { items: Handed[] }) {
  return (
    <>
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted">
        <span className="flex-1">Given to the model</span>
        <span className="text-[10px] font-normal">as the parser found them</span>
      </div>
      <div className="rounded-lg border border-border p-1">
        {items.map(({ icon, label, count, tone }) => (
          <div key={label} className="flex items-center gap-2 px-2 py-1.5 text-[11px]">
            <Icon name={icon} className="size-3 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count !== undefined && (
              <span className={`font-mono text-[10px] tabular-nums ${count === 0 ? "text-muted" : tone === "in" ? "text-incoming" : tone === "out" ? "text-outgoing" : "text-muted"}`}>
                {count}
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// The server says nothing until the whole answer is ready, so this shows only
// what is known: a request is out, for how long, and what it carries. No
// stages, because none are reported; a step shown on a timer would be made up.
function Waiting({ noun, since, handed }: { noun: string; since: number; handed: Handed[] }) {
  return (
    <div role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-accent/40 motion-safe:animate-ping" />
          <span className="relative size-2 rounded-full bg-accent" />
        </span>
        <span className="font-medium">Explaining this {noun}</span>
        <span className="flex-1" />
        <Elapsed key={since} since={since} />
      </div>
      {/* Where the text will land, roughly its shape: two short paragraphs. */}
      <div className="mt-3 flex flex-col gap-1.5 motion-safe:animate-pulse" aria-hidden>
        {["w-full", "w-11/12", "w-4/5", "", "w-full", "w-3/5"].map((w, i) =>
          w === "" ? <span key={i} className="h-1" /> : <span key={i} className={`h-2 rounded-full bg-border ${w}`} />,
        )}
      </div>
      <p className="mt-3 mb-4 text-[10.5px] leading-snug text-muted">
        One already in the cache comes back at once. A new one appears in full once the model has finished writing it.
      </p>
      <div className="opacity-60">
        <HandedList items={handed} />
      </div>
    </div>
  );
}

/** Seconds since the request went out, counted from when it did, so leaving and coming back keeps the count. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-[10px] text-muted tabular-nums">{Math.max(0, Math.floor((now - since) / 1000))}s</span>;
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded bg-background px-1.5 py-px font-sans ring-1 ring-border">{children}</span>;
}
