// Folding: which directories become boxes on the map. Pure, over the parser's
// file list; nothing here is picked in advance, the repository's shape decides.

/** Roughly what anyone can read on one screen. */
export const MAX_NODES = 24;

export interface FoldedNode {
  /** The directory this box stands for, "." at the root. */
  id: string;
  /** Every file folded into it, sorted. */
  files: string[];
}

export interface Fold {
  /** The lowest threshold that landed under MAX_NODES. */
  threshold: number;
  nodes: FoldedNode[];
  /** File path → id of the node holding it. */
  nodeOf: Map<string, string>;
}

export function parentOf(dir: string): string {
  const i = dir.lastIndexOf("/");
  return i === -1 ? "." : dir.slice(0, i);
}

function depthOf(dir: string): number {
  return dir === "." ? 0 : dir.split("/").length;
}

/**
 * Every directory starts as its own node. Deepest first, a directory holding
 * fewer than `threshold` files merges into its parent. Each depth decides who
 * merges from the counts as they stood before any merge at that depth, so no
 * merge at one depth changes what another at the same depth sees.
 */
export function foldAt(files: readonly { path: string; folder: string }[], threshold: number): FoldedNode[] {
  const held = new Map<string, string[]>();
  const hold = (dir: string) => {
    let list = held.get(dir);
    if (!list) held.set(dir, (list = []));
    return list;
  };
  for (const f of files) {
    hold(f.folder).push(f.path);
    // Ancestors exist even with no files of their own, so merges have somewhere to land.
    for (let d = f.folder; d !== "."; ) hold((d = parentOf(d)));
  }

  const byDepth = Map.groupBy(held.keys(), depthOf);
  const deepest = Math.max(0, ...byDepth.keys());
  for (let depth = deepest; depth > 0; depth--) {
    const merging = (byDepth.get(depth) ?? []).filter((dir) => {
      const n = held.get(dir)?.length ?? 0;
      return n > 0 && n < threshold;
    });
    for (const dir of merging) {
      hold(parentOf(dir)).push(...(held.get(dir) ?? []));
      held.set(dir, []);
    }
  }

  return [...held]
    .filter(([, list]) => list.length > 0)
    .map(([id, list]) => ({ id, files: list.toSorted() }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * How many nodes `foldAt` would make at a threshold, from per-directory counts
 * alone: the same merges, deepest first, without moving any paths. A merge at
 * one depth only lands a level up, so the order within a depth doesn't matter.
 */
function nodeCounter(files: readonly { folder: string }[]): (threshold: number) => number {
  const own = new Map<string, number>();
  for (const f of files) {
    own.set(f.folder, (own.get(f.folder) ?? 0) + 1);
    // Ancestors are registered whole, so the first known one means the rest are too.
    for (let d = f.folder; d !== "."; ) {
      d = parentOf(d);
      if (own.has(d)) break;
      own.set(d, 0);
    }
  }
  const dirs = [...own.keys()].sort((a, b) => depthOf(b) - depthOf(a));
  const index = new Map(dirs.map((d, i) => [d, i]));
  const parent = dirs.map((d) => (d === "." ? -1 : (index.get(parentOf(d)) ?? -1)));
  const counts = dirs.map((d) => own.get(d) ?? 0);
  return (threshold) => {
    const held = counts.slice();
    let nodes = 0;
    for (let i = 0; i < dirs.length; i++) {
      const n = held[i];
      if (n > 0 && n < threshold && parent[i] !== -1) held[parent[i]] += n;
      else if (n > 0) nodes++;
    }
    return nodes;
  };
}

/**
 * Raise the threshold from two until the map lands under MAX_NODES, and stop
 * there. The search runs on counts; folding every path at every threshold
 * took 14 seconds on a repository that needed a threshold in the hundreds.
 * The fold itself still runs once, at the threshold found.
 */
export function fold(files: readonly { path: string; folder: string }[], maxNodes = MAX_NODES): Fold {
  const nodesAt = nodeCounter(files);
  let threshold = 2;
  // At files.length + 1 everything merges into the root, so this always ends.
  while (nodesAt(threshold) > maxNodes && threshold <= files.length) threshold++;
  const nodes = foldAt(files, threshold);
  const nodeOf = new Map<string, string>();
  for (const n of nodes) for (const f of n.files) nodeOf.set(f, n.id);
  return { threshold, nodes, nodeOf };
}

/**
 * The shortest trailing part of each path that no other path on screen shares.
 * "src" stays "src" until a second "src" appears, then both grow a segment.
 */
export function shortestUniqueLabels(ids: readonly string[]): Map<string, string> {
  const segments = new Map(ids.map((id) => [id, id === "." ? [] : id.split("/")]));
  const suffix = (id: string, k: number) => (segments.get(id) ?? []).slice(-k).join("/");
  const labels = new Map<string, string>();
  for (const id of ids) {
    const parts = segments.get(id) ?? [];
    if (parts.length === 0) {
      labels.set(id, "(root)");
      continue;
    }
    let k = 1;
    while (k < parts.length && ids.some((other) => other !== id && suffix(other, k) === suffix(id, k))) k++;
    labels.set(id, suffix(id, k));
  }
  return labels;
}
