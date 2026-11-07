"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ExplainResult } from "@/app/analyses/actions";
import type { Selection } from "@/lib/map/highlight";
import { Icon } from "./icons";
import { Prose } from "./prose";
import { Stat, StatStrip } from "./stat";

/** What the pane knows about one subject's explanation. Kept by the workspace, so it outlives the selection. */
export type ExplainState =
  | { status: "loading"; since: number }
  | { status: "error"; message: string }
  | ({ status: "done" } & Extract<ExplainResult, { ok: true }>);

/** One thing the model is given. A count is what the parser found, null when it didn't; in and out are coloured as on the map. */
export interface Handed {
  label: string;
  count: number | null;
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
      {/* Headed like the Structure tab's repository: an icon tile, the name, what it is as a chip. */}
      <div className="flex items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-foreground/70 ring-1 ring-border">
          <Icon name={subject.kind === "file" ? "fileCode" : "folder"} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[13px] font-semibold" dir="rtl" title={subject.kind === "file" ? subject.path : `${subject.id}/`}>
            <bdi>{subject.kind === "file" ? subject.path : subject.id === "." ? "./" : `${subject.id}/`}</bdi>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted">
            <span className="rounded px-1.5 py-px text-foreground/80 capitalize ring-1 ring-border">{noun}</span>
          </p>
        </div>
      </div>

      {!unexplainable && <HandedStrip items={handed} />}

      <div className="flex-1">
        {unexplainable ? (
          <div className="mt-3">
            <Callout>{unexplainable}</Callout>
          </div>
        ) : state === undefined ? (
          <>
            <div className="mt-2">
              <Callout>The model is given the {noun} and these counts, as the parser found them.</Callout>
            </div>
            <button
              type="button"
              onClick={onExplain}
              className="mt-3 w-full rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-white transition-[scale] duration-100 hover:bg-accent/90 active:scale-[0.98]"
            >
              Explain this {noun}
            </button>
          </>
        ) : state.status === "loading" ? (
          <Waiting noun={noun} since={state.since} />
        ) : state.status === "error" ? (
          <>
            <Heading>Explanation</Heading>
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
            <Heading
              aside={
                <span className="flex items-center gap-2">
                  {/* Kept: it's how a working cache is told from a broken one. */}
                  <Tag>{state.cached ? "From cache" : "Generated"}</Tag>
                  <button type="button" onClick={onExplain} className="flex items-center gap-1 hover:text-foreground" data-tip="Ask the model again, skipping the cache">
                    <Icon name="refresh" className="size-3" /> Again
                  </button>
                </span>
              }
            >
              Explanation
            </Heading>
            <Prose body={state.body} className="text-[12px] leading-relaxed text-foreground/90" {...links} />
            {state.removedSentences > 0 && (
              // Said, not hidden: the reader should know the text is shorter than what the model wrote, and why.
              <div className="mt-2">
                <Callout>
                  {state.removedSentences === 1 ? "1 sentence" : `${state.removedSentences} sentences`} removed: named a file the model
                  wasn&apos;t given.
                </Callout>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// The Structure tab's repository strip, so the two tabs read as one pane. In
// and out keep their map colours; a zero goes muted, since nothing flows.
function HandedStrip({ items }: { items: Handed[] }) {
  return (
    <StatStrip>
      {items.map(({ label, count, tone }) => (
        <Stat
          key={label}
          label={label}
          value={count ?? "—"}
          valueClass={count === null || count === 0 ? "text-muted" : tone === "in" ? "text-incoming" : tone === "out" ? "text-outgoing" : ""}
        />
      ))}
    </StatStrip>
  );
}

// The server says nothing until the whole answer is ready, so this shows only
// what is known: a request is out, for how long, and what it carries. No
// stages, because none are reported; a step shown on a timer would be made up.
function Waiting({ noun, since }: { noun: string; since: number }) {
  return (
    <div role="status" aria-live="polite">
      <Heading aside={<Elapsed key={since} since={since} />}>
        <span className="flex items-center gap-2">
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-accent/40 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-accent" />
          </span>
          Explaining this {noun}
        </span>
      </Heading>
      {/* Where the text will land, roughly its shape: two short paragraphs. */}
      <div className="mt-2 flex flex-col gap-1.5 motion-safe:animate-pulse" aria-hidden>
        {["w-full", "w-11/12", "w-4/5", "", "w-full", "w-3/5"].map((w, i) =>
          w === "" ? <span key={i} className="h-1" /> : <span key={i} className={`h-2 rounded-full bg-border ${w}`} />,
        )}
      </div>
      <div className="mt-3">
        <Callout>One already in the cache comes back at once. A new one appears in full once the model has finished writing it.</Callout>
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

// The Structure tab's section heading and callout, so the two tabs read as one pane.
function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-4 mb-1.5 flex items-center gap-1 border-t border-border pt-3 text-[11px] font-semibold text-muted">
      <span className="flex-1">{children}</span>
      {aside && <span className="font-normal">{aside}</span>}
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-1.5 text-[10.5px] leading-snug text-muted">
      <Icon name="info" className="mt-px size-3 shrink-0 opacity-70" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded bg-background px-1.5 py-px font-sans ring-1 ring-border">{children}</span>;
}
