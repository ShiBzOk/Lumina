// Everything the canvas draws, derived from the parser's output without
// reshaping it. Pure: files and edges in, map out.

import type { Edge, RepoFile } from "../../parser/types.ts";
import { fold, shortestUniqueLabels } from "./fold.ts";
import { layout, type Point } from "./layout.ts";

/** What sort of file this is, by extension. Each one is a colour on the map. */
export type FileType = "react" | "typescript" | "javascript" | "component" | "css" | "json" | "other";

export const FILE_TYPES: readonly { type: FileType; label: string }[] = [
  { type: "react", label: ".tsx .jsx" },
  { type: "typescript", label: ".ts .mts" },
  { type: "javascript", label: ".js .mjs" },
  { type: "component", label: ".vue .svelte" },
  { type: "css", label: ".css" },
  { type: "json", label: ".json" },
  { type: "other", label: "other" },
];

const EXTENSIONS: Record<string, FileType> = {
  tsx: "react",
  jsx: "react",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  vue: "component",
  svelte: "component",
  astro: "component",
  css: "css",
  scss: "css",
  json: "json",
};

export function fileTypeOf(path: string): FileType {
  const dot = path.lastIndexOf(".");
  return (dot === -1 ? undefined : EXTENSIONS[path.slice(dot + 1).toLowerCase()]) ?? "other";
}

/** The top-level directory a file lives under: a fact about the tree, not a guess about its purpose. */
export function areaOf(path: string): string {
  const slash = path.indexOf("/");
  return slash === -1 ? "(root)" : path.slice(0, slash);
}

export interface FileRow {
  path: string;
  /** Path relative to the node's directory, unique within the card. */
  label: string;
  type: FileType;
  area: string;
  fanIn: number;
  fanOut: number;
}

export interface MapNode {
  id: string;
  /** Shortest trailing path that is still unique among the nodes on screen. */
  label: string;
  files: FileRow[];
}

export interface MapEdge {
  from: string;
  to: string;
  fromNode: string;
  toNode: string;
}

export interface RepoMap {
  threshold: number;
  nodes: MapNode[];
  edges: MapEdge[];
  nodeOf: Map<string, string>;
  positions: Map<string, Point>;
}

export function buildMap(files: readonly RepoFile[], edges: readonly Edge[]): RepoMap {
  const folded = fold(files);
  const labels = shortestUniqueLabels(folded.nodes.map((n) => n.id));
  const byPath = new Map(files.map((f) => [f.path, f]));

  const nodes: MapNode[] = folded.nodes.map((n) => ({
    id: n.id,
    label: labels.get(n.id) ?? n.id,
    files: n.files.flatMap((path) => {
      const f = byPath.get(path);
      if (!f) return [];
      return [
        {
          path,
          label: n.id === "." ? path : path.slice(n.id.length + 1),
          type: fileTypeOf(path),
          area: areaOf(path),
          fanIn: f.fanIn,
          fanOut: f.fanOut,
        },
      ];
    }),
  }));

  // Only edges whose two ends are both on the map; the parser guarantees that
  // is all of them, and the check script counts it rather than trusting it.
  const mapEdges: MapEdge[] = edges.flatMap((e) => {
    const fromNode = folded.nodeOf.get(e.from);
    const toNode = folded.nodeOf.get(e.to);
    return fromNode && toNode ? [{ from: e.from, to: e.to, fromNode, toNode }] : [];
  });

  const positions = layout(
    nodes.map((n) => ({ id: n.id, rows: n.files.length })),
    mapEdges.map((e) => ({ from: e.fromNode, to: e.toNode })),
  );

  return { threshold: folded.threshold, nodes, edges: mapEdges, nodeOf: folded.nodeOf, positions };
}
