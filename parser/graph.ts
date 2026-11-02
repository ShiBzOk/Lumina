import type { Edge, ImportKind, ImportRecord } from "./types.ts";

// Pure functions over files and edges. Nothing here reads the disk.

/** One edge per ordered pair of files, built only from imports that resolved inside the repository. */
export function buildEdges(imports: readonly ImportRecord[]): Edge[] {
  const byPair = new Map<string, Edge>();
  for (const record of imports) {
    if (record.resolution.status !== "internal") continue;
    const from = record.from;
    const to = record.resolution.target;
    const key = `${from}\0${to}`;
    const edge = byPair.get(key);
    if (edge) {
      if (!edge.kinds.includes(record.kind)) edge.kinds.push(record.kind);
      edge.typeOnly = edge.typeOnly && record.typeOnly;
    } else {
      byPair.set(key, { from, to, kinds: [record.kind], typeOnly: record.typeOnly });
    }
  }
  const order: ImportKind[] = ["import", "re-export", "dynamic-import"];
  return [...byPair.values()]
    .map((e) => ({ ...e, kinds: order.filter((k) => e.kinds.includes(k)) }))
    .sort((a, b) => compare(a.from, b.from) || compare(a.to, b.to));
}

/** Distinct importers (in) and distinct imports (out) per file. Expects deduplicated edges. */
export function fanInOut(
  files: readonly { path: string }[],
  edges: readonly Edge[],
): Map<string, { fanIn: number; fanOut: number }> {
  const counts = new Map(files.map((f) => [f.path, { fanIn: 0, fanOut: 0 }]));
  for (const edge of edges) {
    const from = counts.get(edge.from);
    const to = counts.get(edge.to);
    if (from) from.fanOut += 1;
    if (to) to.fanIn += 1;
  }
  return counts;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
