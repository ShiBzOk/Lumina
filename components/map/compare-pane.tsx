"use client";

import { useState, type ReactNode } from "react";
import { sameSelection, type Selection } from "@/lib/map/highlight";
import { isUnchanged, type Absent, type CompareSide, type Comparison, type EdgePair } from "@/lib/map/compare";
import type { AnalysisOption } from "./analysis-switcher";
import { versionName } from "@/lib/stages";
import { Icon } from "./icons";

/** Rows a list shows before it is asked for the rest. Long lists are real; drawing thousands at once isn't useful. */
const LIST_LIMIT = 40;

export type CompareState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; comparison: Comparison };

interface ComparePaneProps {
  /** Finished analyses of this repository, newest first. */
  analyses: readonly AnalysisOption[];
  base: string;
  /** Always the analysis the map is drawn from. */
  head: string;
  state: CompareState;
  /** Paths on the map, which is the head: only these can be moved to. */
  inHead: ReadonlySet<string>;
  hovered: Selection;
  onBase: (id: string) => void;
  onHead: (id: string) => void;
  onReveal: (path: string) => void;
  onHover: (s: Selection) => void;
  onExit: () => void;
  onCollapse: () => void;
}

// Facts only. Every list says why each path is in it; nothing is counted in a
// header, ranked, or called good or bad.
export function ComparePane(props: ComparePaneProps) {
  const { analyses, base, head, state, onBase, onHead, onExit, onCollapse } = props;
  const labelOf = (id: string) => {
    const a = analyses.find((x) => x.id === id);
    return a ? versionName(a.version) : "—";
  };

  return (
    <aside className="flex w-full flex-col border-l border-border bg-surface">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="text-xs font-medium">Compare</span>
        <span className="flex-1" />
        <button type="button" onClick={onExit} data-tip="Leave Compare" aria-label="Leave Compare" className="rounded p-1 text-muted hover:bg-background">
          <Icon name="x" className="size-3.5" />
        </button>
        <button type="button" onClick={onCollapse} data-tip="Hide details" aria-label="Hide details" className="rounded p-1 text-muted hover:bg-background">
          <Icon name="chevronRight" className="size-3.5" />
        </button>
      </div>

      {/* Read as a sentence: changes from one analysis to another. "Base" and
          "head" stay the names in code; on screen they are just from and to. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5 text-[11px]">
        <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5">
          <span className="text-muted">From</span>
          {/* The analysis on screen is never offered as its own base. */}
          <AnalysisSelect analyses={analyses.filter((a) => a.id !== head)} value={base} onChange={onBase} label="Compare from" />
          <span className="text-muted">To</span>
          <AnalysisSelect analyses={analyses} value={head} onChange={onHead} label="Compare to" />
        </div>
        <button
          type="button"
          onClick={() => onHead(base)}
          data-tip="Swap from and to"
          aria-label="Swap from and to"
          className="shrink-0 rounded-md p-1.5 text-muted ring-1 ring-border hover:bg-background hover:text-foreground"
        >
          <Icon name="swap" className="size-3.5" />
        </button>
      </div>
      <p className="shrink-0 border-b border-border px-3 py-2 text-[10px] leading-snug text-muted">
        What changed from {labelOf(base)} to {labelOf(head)}. The map shows {labelOf(head)}; files added or changed since{" "}
        {labelOf(base)} are marked on it.
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {state.status === "loading" ? (
          <Plain>
            Reading {labelOf(base)}…
          </Plain>
        ) : state.status === "error" ? (
          <p className="mt-4 text-[11px] leading-relaxed text-danger">{state.message}</p>
        ) : (
          <Result {...props} comparison={state.comparison} />
        )}
      </div>
    </aside>
  );
}

function AnalysisSelect({
  analyses,
  value,
  onChange,
  label,
}: {
  analyses: readonly AnalysisOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 rounded-md border border-border bg-surface px-1.5 py-1 font-mono text-[11px] hover:bg-background"
    >
      {analyses.map((a) => (
        <option key={a.id} value={a.id}>
          {versionName(a.version)}
          {a.branch ? ` · ${a.branch}` : ""} · {a.ran}
        </option>
      ))}
    </select>
  );
}

function Plain({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[11px] leading-relaxed text-muted">{children}</p>;
}

function Result({ comparison: c, inHead, hovered, onReveal, onHover }: ComparePaneProps & { comparison: Comparison }) {
  const path = (p: string) => <PathText path={p} inHead={inHead} hovered={hovered} onReveal={onReveal} onHover={onHover} />;
  // A path that joined or left a blast radius only because one side didn't parse it says so.
  const absentFrom = new Map(c.absent.filter((a) => a.kind !== "asset").map((a) => [a.path, a.missingFrom]));
  const edge = (e: EdgePair) => (
    <>
      {path(e.from)} <span className="text-muted">→</span> {path(e.to)}
    </>
  );

  return (
    <>
      {c.adapters.base !== c.adapters.head && (
        <p className="mt-3 rounded-md border border-border bg-background px-2 py-1.5 text-[10.5px] leading-relaxed">
          Parsed by different adapters: <span className="font-mono">{c.adapters.base}</span> in base,{" "}
          <span className="font-mono">{c.adapters.head}</span> in head. Roles and routes may differ for that reason alone.
        </p>
      )}

      {isUnchanged(c) ? (
        <Plain>No structural difference. Both analyses have the same files, the same edges and the same content.</Plain>
      ) : (
        <>
          <Part title="Files added" note="In head, not in base." items={c.filesAdded} render={path} />
          <Part title="Files removed" note="In base, not in head." items={c.filesRemoved} render={path} />
          <Part title="Not parsed on one side" note="Missing from one side for a reason other than being added or removed." items={c.absent} render={(a) => <AbsentItem absent={a}>{path(a.path)}</AbsentItem>} />
          <Part title="Edges added" note="An import in head that base doesn't have." items={c.edgesAdded} render={edge} />
          <Part title="Edges removed" note="An import in base that head doesn't have." items={c.edgesRemoved} render={edge} />
          <Part title="Edges not compared" note="On one side only because one end wasn't parsed on the other." items={c.edgesUncompared} render={(e) => (
                <>
                  {edge(e)}
                  <Reason>
                    <span className="font-mono">{e.because}</span> not parsed in {e.missingFrom}
                  </Reason>
                </>
              )} />
          <Part title="Content changed" note="In both, with a different content hash." items={c.contentChanged} render={path} />
          <Part title="Blast radius changed" note="Files that import it, directly or through one other file." items={c.blastRadius} render={(b) => (
                <>
                  {path(b.path)}
                  <Reason>
                    Blast radius: <span className="font-mono tabular-nums">{b.before}</span> →{" "}
                    <span className="font-mono tabular-nums">{b.after}</span> files
                  </Reason>
                  <Moved sign="+" paths={b.joined} why="joined" absentFrom={absentFrom} path={path} />
                  <Moved sign="−" paths={b.left} why="left" absentFrom={absentFrom} path={path} />
                </>
              )} />
        </>
      )}
    </>
  );
}

function Moved({
  sign,
  paths,
  why,
  absentFrom,
  path,
}: {
  sign: string;
  paths: readonly string[];
  why: string;
  absentFrom: ReadonlyMap<string, CompareSide>;
  path: (p: string) => ReactNode;
}) {
  if (paths.length === 0) return null;
  return (
    <div className="mt-0.5 pl-2">
      {paths.map((p) => {
        const side = absentFrom.get(p);
        return (
          <div key={p} className="flex gap-1.5 py-px" title={`${why} the blast radius`}>
            <span className="w-2 shrink-0 font-mono text-muted">{sign}</span>
            <span className="min-w-0">
              {path(p)}
              {side && <span className="text-[10px] text-muted"> not parsed in {side}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AbsentItem({ absent, children }: { absent: Absent; children: ReactNode }) {
  const lead = absent.kind === "asset" ? `not on the map in ${absent.missingFrom}` : `not parsed in ${absent.missingFrom}`;
  return (
    <>
      {children}
      <Reason>
        {lead}: {absent.reason}
      </Reason>
    </>
  );
}

function Reason({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-[10px] leading-snug text-muted">{children}</p>;
}

// An empty part is left out entirely rather than shown saying "none".
function Part<T>({ title, note, items, render }: { title: string; note: string; items: readonly T[]; render: (item: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, LIST_LIMIT);
  return (
    <section className="mt-4">
      <p className="text-[11px] font-medium">{title}</p>
      <p className="mb-1.5 text-[10px] text-muted">{note}</p>
      <div className="rounded-lg border border-border px-2 py-1">
      {shown.map((item, i) => (
        <div key={i} className="border-b border-border/60 py-1 font-mono text-[11px] leading-snug break-all last:border-b-0">
          {render(item)}
        </div>
      ))}
      {items.length > LIST_LIMIT && (
        <button type="button" onClick={() => setAll((a) => !a)} className="w-full py-1 text-left font-sans text-[10.5px] text-muted hover:text-foreground">
          {all ? "Show fewer" : "Show the rest"}
        </button>
      )}
      </div>
    </section>
  );
}

/** A path in head moves the map to it and lights it there; one that isn't in head is only text. */
function PathText({
  path,
  inHead,
  hovered,
  onReveal,
  onHover,
}: {
  path: string;
  inHead: ReadonlySet<string>;
  hovered: Selection;
  onReveal: (path: string) => void;
  onHover: (s: Selection) => void;
}) {
  if (!inHead.has(path)) return <span className="text-muted" title={`${path} is not in head`}>{path}</span>;
  const target: Selection = { kind: "file", path };
  return (
    <button
      type="button"
      title={path}
      onClick={() => onReveal(path)}
      onMouseEnter={() => onHover(target)}
      onMouseLeave={() => onHover(null)}
      className={`inline rounded px-0.5 text-left break-all ${sameSelection(hovered, target) ? "bg-accent/10 text-accent" : "hover:bg-background hover:text-accent"}`}
    >
      {path}
    </button>
  );
}
