import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Project } from "ts-morph";
import { selectAdapter, type FrameworkAdapter } from "./adapter.ts";
import { extractImports } from "./extract.ts";
import { buildEdges, fanInOut } from "./graph.ts";
import { createResolver } from "./resolve.ts";
import {
  SCHEMA_VERSION,
  type Coverage,
  type ImportKind,
  type ImportRecord,
  type ParseResult,
  type RepoFile,
  type SkippedFile,
  type StatusCounts,
  type UnresolvedGroup,
} from "./types.ts";
import { message, packageOf, walkRepository, type WalkResult } from "./walk.ts";

// Past these, a file is data or build output rather than code someone wrote,
// and parsing it would cost more than it tells. Skipped files are named, never dropped.
const MAX_BYTES = 1024 * 1024;
const MAX_LINE_LENGTH = 5000;
const EXAMPLES_PER_REASON = 5;

interface Loaded {
  rel: string;
  text: string;
  bytes: number;
  sha256: string;
}

export function parseRepository(dir: string, adapters: readonly FrameworkAdapter[] = []): ParseResult {
  const walk = walkRepository(dir);
  const problems = [...walk.problems];
  const adapter = selectAdapter(walk, adapters);

  // Every skip decision is made before anything resolves, so an import that
  // lands on a skipped file is reported as such rather than as an edge.
  const loaded: Loaded[] = [];
  const skipped = new Map<string, SkippedFile>();
  for (const rel of walk.sources) {
    const outcome = load(walk, rel);
    if ("reason" in outcome) skipped.set(rel, outcome);
    else loaded.push(outcome);
  }

  const resolve = createResolver(walk, skipped, problems);
  const project = new Project({ useInMemoryFileSystem: true, skipLoadingLibFiles: true });
  const imports: ImportRecord[] = [];
  const syntaxErrors: Coverage["syntaxErrors"] = [];
  const roles = new Map<string, string | null>();
  let requireCalls = 0;

  for (const file of loaded) {
    const source = project.createSourceFile(`/${file.rel}`, file.text, { overwrite: true });
    const found = extractImports(source);
    roles.set(file.rel, adapter.reader.read(file.rel, source));
    project.removeSourceFile(source);

    requireCalls += found.requireCalls;
    if (found.syntaxErrors > 0) syntaxErrors.push({ path: file.rel, count: found.syntaxErrors });

    for (const item of found.imports) {
      imports.push({
        from: file.rel,
        specifier: item.specifier ?? item.text,
        kind: item.kind,
        typeOnly: item.typeOnly,
        line: item.line,
        resolution:
          item.specifier === null
            ? {
                status: "unresolved",
                reason: "non-literal-specifier",
                detail: "the argument is an expression, so the target is only known at runtime",
              }
            : resolve(item.specifier, file.rel, item.kind),
      });
    }
  }

  // Non-code files an import resolved to become nodes too, so no edge points at nothing.
  const sourcePaths = new Set(loaded.map((f) => f.rel));
  const assetPaths = new Set<string>();
  for (const record of imports) {
    if (record.resolution.status === "internal" && !sourcePaths.has(record.resolution.target)) {
      assetPaths.add(record.resolution.target);
    }
  }

  const files: RepoFile[] = [];
  for (const file of loaded) files.push(toRepoFile(walk, file, "source", lineCount(file.text), roles.get(file.rel) ?? null));
  for (const rel of [...assetPaths].sort()) {
    const buffer = fs.readFileSync(`${walk.root}/${rel}`);
    const lines = buffer.includes(0) ? null : lineCount(buffer.toString("utf8"));
    files.push(toRepoFile(walk, { rel, text: "", bytes: buffer.length, sha256: hash(buffer) }, "asset", lines, null));
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const edges = buildEdges(imports);
  const fan = fanInOut(files, edges);
  for (const file of files) Object.assign(file, fan.get(file.path));
  const routes = adapter.reader.routes();

  return {
    schemaVersion: SCHEMA_VERSION,
    root: walk.root,
    adapter: adapter.name,
    files,
    edges,
    imports,
    routes: routes.routes,
    routesWithheld: routes.withheld,
    coverage: {
      filesFound: walk.sources.length,
      filesParsed: loaded.length,
      filesSkipped: skipped.size,
      skipped: [...skipped.values()],
      syntaxErrors,
      excludedPaths: walk.excluded,
      assetFiles: assetPaths.size,
      imports: countStatuses(imports),
      importsByKind: byKind(imports),
      unresolved: groupUnresolved(imports),
      deferred: { require: requireCalls },
      configProblems: [...new Set(problems)],
    },
  };
}

function load(walk: WalkResult, rel: string): Loaded | SkippedFile {
  const abs = `${walk.root}/${rel}`;
  let buffer: Buffer;
  try {
    const { size } = fs.statSync(abs);
    if (size > MAX_BYTES) {
      return { path: rel, reason: "too-large", detail: `${size} bytes, limit is ${MAX_BYTES}` };
    }
    buffer = fs.readFileSync(abs);
  } catch (error) {
    return { path: rel, reason: "unreadable", detail: message(error) };
  }
  if (buffer.includes(0)) return { path: rel, reason: "binary", detail: "contains NUL bytes" };
  const text = buffer.toString("utf8");
  const longest = text.split(/\r\n|\r|\n/).reduce((max, line) => Math.max(max, line.length), 0);
  if (longest > MAX_LINE_LENGTH) {
    return { path: rel, reason: "minified", detail: `a ${longest}-character line, limit is ${MAX_LINE_LENGTH}` };
  }
  return { rel, text, bytes: buffer.length, sha256: hash(buffer) };
}

function toRepoFile(
  walk: WalkResult,
  file: Loaded,
  kind: RepoFile["kind"],
  lines: number | null,
  role: string | null,
): RepoFile {
  return {
    path: file.rel,
    folder: path.posix.dirname(file.rel),
    package: packageOf(walk.packages, file.rel)?.dir ?? null,
    kind,
    lines,
    bytes: file.bytes,
    sha256: file.sha256,
    role,
    fanIn: 0,
    fanOut: 0,
  };
}

function lineCount(text: string): number {
  if (text === "") return 0;
  const lines = text.split(/\r\n|\r|\n/).length;
  return /(\r\n|\r|\n)$/.test(text) ? lines - 1 : lines;
}

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function countStatuses(imports: readonly ImportRecord[]): StatusCounts {
  const counts: StatusCounts = { found: imports.length, internal: 0, external: 0, excluded: 0, unresolved: 0 };
  for (const record of imports) counts[record.resolution.status] += 1;
  return counts;
}

function byKind(imports: readonly ImportRecord[]): Record<ImportKind, StatusCounts> {
  const of = (kind: ImportKind) => countStatuses(imports.filter((r) => r.kind === kind));
  return { import: of("import"), "re-export": of("re-export"), "dynamic-import": of("dynamic-import") };
}

function groupUnresolved(imports: readonly ImportRecord[]): UnresolvedGroup[] {
  const groups = new Map<string, UnresolvedGroup>();
  for (const record of imports) {
    const r = record.resolution;
    if (r.status !== "unresolved") continue;
    let group = groups.get(r.reason);
    if (!group) {
      group = { reason: r.reason, count: 0, examples: [] };
      groups.set(r.reason, group);
    }
    group.count += 1;
    if (group.examples.length < EXAMPLES_PER_REASON) {
      group.examples.push({ from: record.from, specifier: record.specifier, line: record.line, detail: r.detail });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}
