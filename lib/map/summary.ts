// What the detail pane says about the repository as a whole, and about a
// folder. Pure counting over the parser's file list; nothing is fetched.

import type { ImportRecord, RepoFile } from "../../parser/types.ts";
import { FILE_TYPES, fileTypeOf, type FileType } from "./model.ts";

export interface RepoSummary {
  files: number;
  /** Every import statement seen, whatever it resolved to. */
  imports: number;
  /** Of those, the ones that resolved to a file in the repository. */
  resolvedImports: number;
  /** Files ordered by how many files import them, most first. Only files something imports. */
  mostImported: RepoFile[];
  /** Files nothing imports, ordered by how much they pull in: the tops of the tree come first. */
  notImported: RepoFile[];
  /** Files the framework adapter gave no role. */
  unidentified: number;
}

const byPath = (a: RepoFile, b: RepoFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

export function summarize(files: readonly RepoFile[], imports: readonly ImportRecord[]): RepoSummary {
  return {
    files: files.length,
    imports: imports.length,
    resolvedImports: imports.filter((r) => r.resolution.status === "internal").length,
    mostImported: files.filter((f) => f.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn || byPath(a, b)),
    notImported: files.filter((f) => f.fanIn === 0).sort((a, b) => b.fanOut - a.fanOut || byPath(a, b)),
    unidentified: files.filter((f) => f.role === null).length,
  };
}

/** How many files of each type, in the map's legend order, leaving out types with none. */
export function countTypes(paths: readonly string[]): { type: FileType; label: string; count: number }[] {
  const counts = new Map<FileType, number>();
  for (const p of paths) counts.set(fileTypeOf(p), (counts.get(fileTypeOf(p)) ?? 0) + 1);
  return FILE_TYPES.flatMap(({ type, label }) => {
    const count = counts.get(type) ?? 0;
    return count > 0 ? [{ type, label, count }] : [];
  });
}
