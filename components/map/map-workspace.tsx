"use client";

import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { highlight, isFiltering, matches, sameSelection, type Filter, type Selection } from "@/lib/map/highlight";
import { adjacency } from "@/lib/map/graph";
import { findInsights } from "@/lib/map/insights";
import { buildMap, fileTypeOf } from "@/lib/map/model";
import { summarize } from "@/lib/map/summary";
import type { Coverage, Edge, ImportRecord, RepoFile } from "@/parser/types";
import { Canvas, type CanvasHandle } from "./canvas";
import { CategoryRail } from "./category-rail";
import { CoverageBanner } from "./coverage-banner";
import { DetailPane, type PaneTab } from "./detail-pane";
import { Icon } from "./icons";
import { FileSearch } from "./file-search";

interface MapWorkspaceProps {
  meta: { repo: string; branch: string; commit: string };
  adapter: string;
  files: RepoFile[];
  edges: Edge[];
  imports: ImportRecord[];
  coverage: Coverage;
}

// The shell: header across the top, categories on the left, the canvas in the
// middle, details on the right. Later phases add to these panels, not move them.
export function MapWorkspace({ meta, adapter, files, edges, imports, coverage }: MapWorkspaceProps) {
  const map = useMemo(() => buildMap(files, edges), [files, edges]);
  const [selection, setSelection] = useState<Selection>(null);
  // What the pointer is over, on the map or in the pane; each lights it in the other.
  const [hovered, setHovered] = useState<Selection>(null);
  const [filter, setFilter] = useState<Filter>({ area: null, hiddenTypes: new Set() });
  const [railOpen, setRailOpen] = useState(true);
  const [paneOpen, setPaneOpen] = useState(true);
  const [tab, setTab] = useState<PaneTab>("structure");
  // Lives here so it stays shut until asked, however often the pane redraws.
  const [insightsOpen, setInsightsOpen] = useState(false);
  const canvas = useRef<CanvasHandle>(null);

  const lit = useMemo(() => highlight(map, selection), [map, selection]);
  const summary = useMemo(() => summarize(files, imports), [files, imports]);
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const importsOf = useMemo(
    () =>
      Map.groupBy(
        imports.toSorted((a, b) => a.line - b.line),
        (r) => r.from,
      ),
    [imports],
  );
  const graph = useMemo(() => adjacency(edges), [edges]);
  const insights = useMemo(() => findInsights(files, edges, adapter), [files, edges, adapter]);

  // Counted under the type filter too, so an area's number is the sum of
  // what its cards say matched.
  const areas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of map.nodes)
      for (const f of n.files) if (!filter.hiddenTypes.has(f.type)) counts.set(f.area, (counts.get(f.area) ?? 0) + 1);
    return [...counts].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count || (a.area < b.area ? -1 : 1));
  }, [map, filter.hiddenTypes]);
  const types = useMemo(() => new Set(files.map((f) => fileTypeOf(f.path))), [files]);
  const filtering = isFiltering(filter);
  const matchingCount = useMemo(
    () => (filtering ? map.nodes.reduce((n, node) => n + node.files.filter((f) => matches(f, filter)).length, 0) : files.length),
    [filtering, map, filter, files.length],
  );

  // Selecting from the pane or search also brings the card into view, which
  // only ever happens because that click asked for it.
  const select = useCallback((next: Selection) => {
    setSelection(next);
    // The row under the pointer may be gone after the pane redraws, and never say so.
    setHovered(null);
    if (next) setPaneOpen(true);
  }, []);
  const hover = useCallback((next: Selection) => setHovered((prev) => (sameSelection(prev, next) ? prev : next)), []);
  const selectAndReveal = useCallback(
    (next: Selection) => {
      select(next);
      const id = next?.kind === "node" ? next.id : next?.kind === "file" ? map.nodeOf.get(next.path) : undefined;
      if (id) canvas.current?.reveal(id, next?.kind === "file" ? next.path : undefined);
    },
    [select, map],
  );

  const filterName = [filter.area, filter.hiddenTypes.size > 0 ? `${filter.hiddenTypes.size} type${filter.hiddenTypes.size > 1 ? "s" : ""} hidden` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Link href="/" title="Back to analyses" className="rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground">
          <Icon name="arrowLeft" className="size-4" />
        </Link>
        <span className="text-[19px] font-semibold tracking-[-0.03em]">Lumina</span>
        <span className="h-5 w-px bg-border" aria-hidden />
        <span className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 font-mono text-[11px]">
          <Icon name="repo" className="size-3.5 text-accent" />
          {meta.repo}
          <span className="rounded bg-background px-1 text-[10px] text-muted ring-1 ring-border">{meta.branch}</span>
        </span>

        <div className="flex flex-1 items-center justify-center gap-2 font-mono text-[11px] text-muted">
          <Icon name="branch" className="size-3.5" />
          <span className="text-foreground">{meta.branch}</span>
          <span title={meta.commit}>{meta.commit.slice(0, 7)}</span>·<span>{files.length} files</span>·
          <span>{edges.length} dependency links</span>
        </div>

        <FileSearch rows={map.nodes.flatMap((n) => n.files)} onPick={(path) => selectAndReveal({ kind: "file", path })} />
        <button
          type="button"
          title={railOpen ? "Hide categories" : "Show categories"}
          aria-pressed={railOpen}
          onClick={() => setRailOpen((o) => !o)}
          className={`rounded-md p-1.5 hover:bg-background ${railOpen ? "text-foreground" : "text-muted"}`}
        >
          <Icon name="sliders" className="size-4" />
        </button>
        <UserButton />
      </header>

      <CoverageBanner coverage={coverage} />

      <div className="flex min-h-0 flex-1">
        {railOpen && (
          <CategoryRail
            total={files.length}
            matching={areas.reduce((n, a) => n + a.count, 0)}
            areas={areas}
            types={types}
            filter={filter}
            onFilter={setFilter}
            onCollapse={() => setRailOpen(false)}
          />
        )}

        <Canvas
          ref={canvas}
          map={map}
          selection={selection}
          highlight={lit}
          hovered={hovered}
          filter={filter}
          onSelect={select}
          onHover={hover}
          banner={
            <div className="flex items-center gap-2 rounded-full bg-surface/95 px-3.5 py-1.5 text-[11px] whitespace-nowrap text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border">
              {filtering ? (
                <>
                  <span>
                    Filtering: <span className="font-mono font-medium text-foreground">{filterName}</span>
                  </span>
                  <span className="font-mono">· {matchingCount} files</span>
                  <button
                    type="button"
                    onClick={() => setFilter({ area: null, hiddenTypes: new Set() })}
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Clear
                  </button>
                </>
              ) : (
                <>
                  <Icon name="layers" className="size-3.5" />
                  <span>
                    {map.nodes.length} folders from {files.length} files · click a card or file to trace its connections
                  </span>
                </>
              )}
            </div>
          }
        >
          {!railOpen && (
            <button
              data-overlay
              type="button"
              title="Show categories"
              onClick={() => setRailOpen(true)}
              className="absolute top-3 left-3 flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border hover:text-foreground"
            >
              <Icon name="layers" className="size-4" />
            </button>
          )}
          {!paneOpen && (
            <button
              data-overlay
              type="button"
              title="Show details"
              onClick={() => setPaneOpen(true)}
              className="absolute top-32 right-3 flex size-9 items-center justify-center rounded-xl bg-surface text-muted shadow-[0_1px_6px_rgba(16,24,40,0.06)] ring-1 ring-border hover:text-foreground"
            >
              <Icon name="network" className="size-4" />
            </button>
          )}
        </Canvas>

        {paneOpen && (
          <DetailPane
            map={map}
            repo={meta.repo}
            adapter={adapter}
            summary={summary}
            selection={selection}
            hovered={hovered}
            files={byPath}
            importsOf={importsOf}
            graph={graph}
            insights={insights}
            insightsOpen={insightsOpen}
            onInsightsOpen={setInsightsOpen}
            tab={tab}
            onTab={setTab}
            onSelect={selectAndReveal}
            onHover={hover}
            onCollapse={() => setPaneOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
