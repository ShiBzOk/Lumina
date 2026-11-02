// The shape the parser writes to disk. Everything built after the parser reads
// this, so it is a contract: change it and SCHEMA_VERSION goes up.

export const SCHEMA_VERSION = 3;

/** "source" files were parsed; "asset" files (css, json, svg…) are nodes only
 * because a parsed import resolved to them, so no edge points at nothing. */
export type FileKind = "source" | "asset";

export interface RepoFile {
  /** Repository-relative, forward slashes. The file's identity everywhere. */
  path: string;
  /** Parent directory, "." at the root. The grouping value for the map. */
  folder: string;
  /** Directory of the nearest package.json, "." for the root one, null if none. */
  package: string | null;
  kind: FileKind;
  /** Null for binary assets, which have no lines. */
  lines: number | null;
  bytes: number;
  sha256: string;
  /** What the framework adapter says this file is. Always null under the fallback. */
  role: string | null;
  /** Distinct files that import this one. */
  fanIn: number;
  /** Distinct files this one imports. */
  fanOut: number;
}

/** "require" is a CommonJS `require()` call or TypeScript's `import x = require()`. */
export type ImportKind = "import" | "re-export" | "dynamic-import" | "require";
export const IMPORT_KINDS: readonly ImportKind[] = ["import", "re-export", "dynamic-import", "require"];

export type ExternalReason = "builtin" | "package" | "outside-repo";
export const EXTERNAL_REASONS: readonly ExternalReason[] = ["builtin", "package", "outside-repo"];

export type ExcludedReason = "ignored-path" | "skipped-file";
export const EXCLUDED_REASONS: readonly ExcludedReason[] = ["ignored-path", "skipped-file"];

export type UnresolvedReason =
  | "file-not-found"
  | "extension-required"
  | "alias-target-missing"
  | "workspace-entry-missing"
  | "undeclared-package"
  | "non-literal-specifier"
  | "not-in-walk";
export const UNRESOLVED_REASONS: readonly UnresolvedReason[] = [
  "file-not-found",
  "extension-required",
  "alias-target-missing",
  "workspace-entry-missing",
  "undeclared-package",
  "non-literal-specifier",
  "not-in-walk",
];

export type Resolution =
  | { status: "internal"; target: string }
  | { status: "external"; reason: ExternalReason; detail: string }
  | { status: "excluded"; reason: ExcludedReason; target: string; detail: string }
  | { status: "unresolved"; reason: UnresolvedReason; detail: string };

export type ResolutionStatus = Resolution["status"];

/** One import as written in one file. Every import seen is here, edge or not. */
export interface ImportRecord {
  from: string;
  /** The literal module specifier, or the argument's source text when it isn't a literal. */
  specifier: string;
  kind: ImportKind;
  typeOnly: boolean;
  line: number;
  resolution: Resolution;
}

/** A resolved connection between two files, one per ordered pair. */
export interface Edge {
  from: string;
  to: string;
  kinds: ImportKind[];
  /** True only when every import behind this edge is type-only. */
  typeOnly: boolean;
}

export type SkipReason = "too-large" | "binary" | "minified" | "unreadable";
export const SKIP_REASONS: readonly SkipReason[] = ["too-large", "binary", "minified", "unreadable"];

export interface SkippedFile {
  path: string;
  reason: SkipReason;
  detail: string;
}

export type ExcludedPathReason = "vcs" | "dependencies" | "gitignored" | "symlink";
export const EXCLUDED_PATH_REASONS: readonly ExcludedPathReason[] = [
  "vcs",
  "dependencies",
  "gitignored",
  "symlink",
];

/** A file or directory the walk deliberately did not enter. */
export interface ExcludedPath {
  path: string;
  reason: ExcludedPathReason;
  detail: string;
}

export interface StatusCounts {
  found: number;
  internal: number;
  external: number;
  excluded: number;
  unresolved: number;
}

export interface UnresolvedGroup {
  reason: UnresolvedReason;
  count: number;
  /** A handful of real cases, so a count is never the only evidence. */
  examples: { from: string; specifier: string; line: number; detail: string }[];
}

export interface Coverage {
  /** Source files the walk found. Always equals filesParsed + filesSkipped. */
  filesFound: number;
  filesParsed: number;
  filesSkipped: number;
  skipped: SkippedFile[];
  /** Parsed, but TypeScript reported syntax errors, so imports may be incomplete. */
  syntaxErrors: { path: string; count: number }[];
  excludedPaths: ExcludedPath[];
  /** Non-source files that became nodes because an import resolved to them. */
  assetFiles: number;
  imports: StatusCounts;
  importsByKind: Record<ImportKind, StatusCounts>;
  unresolved: UnresolvedGroup[];
  /** tsconfig / package.json problems met while resolving. */
  configProblems: string[];
}

/** A route whose method and full pattern were both read from the syntax, nothing inferred. */
export interface Route {
  file: string;
  /** Where the method is written: the decorator, or the exported handler. */
  line: number;
  method: string;
  pattern: string;
}

/** A route definition the adapter saw but could not state exactly, and why. */
export interface WithheldRoute {
  file: string;
  line: number;
  reason: string;
}

export interface ParseResult {
  schemaVersion: typeof SCHEMA_VERSION;
  /** Absolute path that was parsed. */
  root: string;
  adapter: string;
  files: RepoFile[];
  edges: Edge[];
  imports: ImportRecord[];
  routes: Route[];
  routesWithheld: WithheldRoute[];
  coverage: Coverage;
}
