"use client";

import { useState, type ReactNode } from "react";
import { coverageFigure } from "@/lib/map/coverage";
import { formatCount } from "@/lib/stages";
import type { Coverage } from "@/parser/types";
import { Icon } from "./icons";

// Says the graph is partial whenever it is. It collapses, but only to a single
// line that still names the figure; it can't be dismissed, so a graph that is
// quietly incomplete can never look complete.
export function CoverageBanner({ coverage }: { coverage: Coverage }) {
  const [open, setOpen] = useState(true);
  const figure = coverageFigure(coverage);
  if (!figure.partial) return null;

  const skippedByReason = Map.groupBy(coverage.skipped, (s) => s.reason);
  const examples = 3;

  return (
    <section className="shrink-0 border-b border-border bg-surface text-[11px]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left hover:bg-background"
      >
        <Icon name="alert" className="size-3.5 text-muted" />
        <span>
          Partial graph: <span className="font-mono font-semibold tabular-nums">{figure.percent.toFixed(1)}%</span> of imports into the
          repository resolved to a file{" "}
          <span className="font-mono text-muted tabular-nums">
            ({formatCount(figure.resolved)} of {formatCount(figure.intoRepo)})
          </span>
          {coverage.filesSkipped > 0 && (
            <span className="text-muted">
              {" "}
              · {formatCount(coverage.filesSkipped)} of {formatCount(coverage.filesFound)} source files not parsed
            </span>
          )}
        </span>
        <span className="flex-1" />
        <span className="text-muted">{open ? "Collapse" : "Details"}</span>
        <Icon name={open ? "chevronDown" : "chevronRight"} className="size-3.5 text-muted" />
      </button>

      {open && (
        <div className="grid max-h-48 grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-x-6 gap-y-3 overflow-y-auto px-4 pt-1 pb-3">
          {coverage.unresolved.length > 0 && (
            <Group title="Unresolved imports" count={coverage.imports.unresolved}>
              {coverage.unresolved.map((g) => (
                <div key={g.reason}>
                  <Line label={g.reason} count={g.count} />
                  {g.examples.slice(0, examples).map((x) => (
                    <p key={`${x.from}:${x.line}`} className="truncate pl-3 font-mono text-[10px] text-muted" title={x.detail}>
                      {x.from}:{x.line} “{x.specifier}”
                    </p>
                  ))}
                </div>
              ))}
            </Group>
          )}
          {coverage.imports.excluded > 0 && (
            <Group title="Imports of files left out of the map" count={coverage.imports.excluded}>
              <p className="text-muted">They reach a real file that was skipped or sits in an ignored path, so no edge is drawn.</p>
            </Group>
          )}
          {coverage.filesSkipped > 0 && (
            <Group title="Source files not parsed" count={coverage.filesSkipped}>
              {[...skippedByReason].map(([reason, files]) => (
                <div key={reason}>
                  <Line label={reason} count={files.length} />
                  {files.slice(0, examples).map((f) => (
                    <p key={f.path} className="truncate pl-3 font-mono text-[10px] text-muted" title={f.detail}>
                      {f.path}
                    </p>
                  ))}
                </div>
              ))}
            </Group>
          )}
          {coverage.syntaxErrors.length > 0 && (
            <Group title="Parsed with syntax errors" count={coverage.syntaxErrors.length}>
              <p className="text-muted">Their imports may be incomplete.</p>
              {coverage.syntaxErrors.slice(0, examples).map((s) => (
                <p key={s.path} className="truncate pl-3 font-mono text-[10px] text-muted">
                  {s.path}
                </p>
              ))}
            </Group>
          )}
        </div>
      )}
    </section>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-baseline justify-between gap-2 font-medium">
        {title}
        <span className="font-mono text-muted tabular-nums">{formatCount(count)}</span>
      </p>
      {children}
    </div>
  );
}

function Line({ label, count }: { label: string; count: number }) {
  return (
    <p className="flex justify-between gap-2 font-mono text-[10px]">
      <span>{label}</span>
      <span className="text-muted tabular-nums">{formatCount(count)}</span>
    </p>
  );
}
