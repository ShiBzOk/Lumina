import type { SourceFile } from "ts-morph";
import type { Route, WithheldRoute } from "./types.ts";
import type { PackageInfo } from "./walk.ts";

// Framework knowledge lives behind this interface and nowhere else. The parser
// asks an adapter what a file *means* (a page, a controller…); it never asks
// which framework it is looking at.

/** What an adapter may look at to decide whether its framework is present. */
export interface Repository {
  /** Absolute, forward slashes. */
  root: string;
  /** Every file the walk kept, repository-relative. */
  files: ReadonlySet<string>;
  packages: ReadonlyMap<string, PackageInfo>;
}

export interface FrameworkAdapter {
  readonly name: string;
  /** A reader for this repository's files, or null when the framework isn't present. */
  detect(repo: Repository): FrameworkReader | null;
}

export interface FrameworkReader {
  /** Offered every parsed file once. What the framework says the file is, or null when convention says nothing. */
  read(path: string, source: SourceFile): string | null;
  /** Asked once every file has been read, because part of a route can live in another file. */
  routes(): { routes: Route[]; withheld: WithheldRoute[] };
}

/** Assumes no framework at all: no file gets a role, no route is extracted. */
export const fallbackAdapter = {
  name: "none",
  detect: () => ({ read: () => null, routes: () => ({ routes: [], withheld: [] }) }),
} satisfies FrameworkAdapter;

/** Adapters are tried in the order given and the first that recognises the repository wins. */
export function selectAdapter(
  repo: Repository,
  adapters: readonly FrameworkAdapter[],
): { name: string; reader: FrameworkReader } {
  for (const adapter of adapters) {
    const reader = adapter.detect(repo);
    if (reader) return { name: adapter.name, reader };
  }
  return { name: fallbackAdapter.name, reader: fallbackAdapter.detect() };
}
