// What a selection lights up and what a filter keeps. Pure arithmetic over the
// edge list, so it is instant on every click.

import type { FileRow, FileType, MapEdge, RepoMap } from "./model.ts";

export type Selection = { kind: "file"; path: string } | { kind: "node"; id: string } | null;

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "file") return b.kind === "file" && a.path === b.path;
  return b.kind === "node" && a.id === b.id;
}

/** Relative to the selection: flowing into it, out of it, or inside a selected folder. */
export type Direction = "in" | "out" | "internal";

export interface Highlight {
  /** Edge index → its direction, for edges touching the selection only. */
  edges: Map<number, Direction>;
  /** Selected files plus every file on the other end of a lit edge. */
  files: Set<string>;
  nodes: Set<string>;
  /** Which side handles of a row carry a lit edge, and in which direction. */
  handles: Map<string, { left?: Direction; right?: Direction }>;
}

export function highlight(map: RepoMap, selection: Selection): Highlight | null {
  if (!selection) return null;
  const selected = new Set(
    selection.kind === "file" ? [selection.path] : (map.nodes.find((n) => n.id === selection.id)?.files.map((f) => f.path) ?? []),
  );
  const edges = new Map<number, Direction>();
  const files = new Set(selected);
  const handles = new Map<string, { left?: Direction; right?: Direction }>();
  const light = (path: string, side: "left" | "right", d: Direction) => handles.set(path, { ...handles.get(path), [side]: d });

  map.edges.forEach((e: MapEdge, i) => {
    const from = selected.has(e.from);
    const to = selected.has(e.to);
    if (!from && !to) return;
    const d: Direction = from && to ? "internal" : from ? "out" : "in";
    edges.set(i, d);
    files.add(e.from);
    files.add(e.to);
    light(e.from, "right", d);
    light(e.to, "left", d);
  });

  const nodes = new Set<string>();
  for (const f of files) {
    const n = map.nodeOf.get(f);
    if (n) nodes.add(n);
  }
  if (selection.kind === "node") nodes.add(selection.id);
  return { edges, files, nodes, handles };
}

export interface Filter {
  /** Top-level directory, or null for every file. */
  area: string | null;
  hiddenTypes: ReadonlySet<FileType>;
}

export function isFiltering(filter: Filter): boolean {
  return filter.area !== null || filter.hiddenTypes.size > 0;
}

export function matches(row: Pick<FileRow, "area" | "type">, filter: Filter): boolean {
  return (filter.area === null || row.area === filter.area) && !filter.hiddenTypes.has(row.type);
}
