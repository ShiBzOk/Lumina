import fs from "node:fs";
import {
  EXCLUDED_PATH_REASONS,
  EXCLUDED_REASONS,
  EXTERNAL_REASONS,
  IMPORT_KINDS,
  SCHEMA_VERSION,
  SKIP_REASONS,
  UNRESOLVED_REASONS,
  type Coverage,
  type Edge,
  type ImportRecord,
  type ParseResult,
  type RepoFile,
  type Resolution,
  type StatusCounts,
} from "./types.ts";

export function writeParseResult(file: string, result: ParseResult): void {
  fs.writeFileSync(file, JSON.stringify(result));
}

// Reading back rebuilds the result field by field from `unknown`, so a file
// that doesn't match the contract fails here, loudly, with the path of the
// bad field, instead of somewhere downstream.
export function readParseResult(file: string): ParseResult {
  const data: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  const at = "result";
  const root = obj(data, at);
  const version = num(root, "schemaVersion", at);
  if (version !== SCHEMA_VERSION) fail(`${at}.schemaVersion`, `version ${SCHEMA_VERSION}, got ${version}`);
  return {
    schemaVersion: SCHEMA_VERSION,
    root: str(root, "root", at),
    adapter: str(root, "adapter", at),
    files: list(root, "files", at, repoFile),
    edges: list(root, "edges", at, edge),
    imports: list(root, "imports", at, importRecord),
    coverage: coverage(get(root, "coverage"), `${at}.coverage`),
  };
}

function repoFile(v: unknown, at: string): RepoFile {
  const o = obj(v, at);
  return {
    path: str(o, "path", at),
    folder: str(o, "folder", at),
    package: nullable(o, "package", at, str),
    kind: oneOf(o, "kind", at, ["source", "asset"] as const),
    lines: nullable(o, "lines", at, num),
    bytes: num(o, "bytes", at),
    sha256: str(o, "sha256", at),
    role: nullable(o, "role", at, str),
    fanIn: num(o, "fanIn", at),
    fanOut: num(o, "fanOut", at),
  };
}

function edge(v: unknown, at: string): Edge {
  const o = obj(v, at);
  return {
    from: str(o, "from", at),
    to: str(o, "to", at),
    kinds: list(o, "kinds", at, (k, kAt) => member(k, kAt, IMPORT_KINDS)),
    typeOnly: bool(o, "typeOnly", at),
  };
}

function importRecord(v: unknown, at: string): ImportRecord {
  const o = obj(v, at);
  return {
    from: str(o, "from", at),
    specifier: str(o, "specifier", at),
    kind: oneOf(o, "kind", at, IMPORT_KINDS),
    typeOnly: bool(o, "typeOnly", at),
    line: num(o, "line", at),
    resolution: resolution(get(o, "resolution"), `${at}.resolution`),
  };
}

function resolution(v: unknown, at: string): Resolution {
  const o = obj(v, at);
  const status = oneOf(o, "status", at, ["internal", "external", "excluded", "unresolved"] as const);
  switch (status) {
    case "internal":
      return { status, target: str(o, "target", at) };
    case "external":
      return { status, reason: oneOf(o, "reason", at, EXTERNAL_REASONS), detail: str(o, "detail", at) };
    case "excluded":
      return {
        status,
        reason: oneOf(o, "reason", at, EXCLUDED_REASONS),
        target: str(o, "target", at),
        detail: str(o, "detail", at),
      };
    case "unresolved":
      return { status, reason: oneOf(o, "reason", at, UNRESOLVED_REASONS), detail: str(o, "detail", at) };
  }
}

function statusCounts(v: unknown, at: string): StatusCounts {
  const o = obj(v, at);
  return {
    found: num(o, "found", at),
    internal: num(o, "internal", at),
    external: num(o, "external", at),
    excluded: num(o, "excluded", at),
    unresolved: num(o, "unresolved", at),
  };
}

function coverage(v: unknown, at: string): Coverage {
  const o = obj(v, at);
  const kinds = obj(get(o, "importsByKind"), `${at}.importsByKind`);
  return {
    filesFound: num(o, "filesFound", at),
    filesParsed: num(o, "filesParsed", at),
    filesSkipped: num(o, "filesSkipped", at),
    skipped: list(o, "skipped", at, (s, sAt) => {
      const so = obj(s, sAt);
      return { path: str(so, "path", sAt), reason: oneOf(so, "reason", sAt, SKIP_REASONS), detail: str(so, "detail", sAt) };
    }),
    syntaxErrors: list(o, "syntaxErrors", at, (s, sAt) => {
      const so = obj(s, sAt);
      return { path: str(so, "path", sAt), count: num(so, "count", sAt) };
    }),
    excludedPaths: list(o, "excludedPaths", at, (e, eAt) => {
      const eo = obj(e, eAt);
      return {
        path: str(eo, "path", eAt),
        reason: oneOf(eo, "reason", eAt, EXCLUDED_PATH_REASONS),
        detail: str(eo, "detail", eAt),
      };
    }),
    assetFiles: num(o, "assetFiles", at),
    imports: statusCounts(get(o, "imports"), `${at}.imports`),
    importsByKind: {
      import: statusCounts(get(kinds, "import"), `${at}.importsByKind.import`),
      "re-export": statusCounts(get(kinds, "re-export"), `${at}.importsByKind.re-export`),
      "dynamic-import": statusCounts(get(kinds, "dynamic-import"), `${at}.importsByKind.dynamic-import`),
    },
    unresolved: list(o, "unresolved", at, (g, gAt) => {
      const go = obj(g, gAt);
      return {
        reason: oneOf(go, "reason", gAt, UNRESOLVED_REASONS),
        count: num(go, "count", gAt),
        examples: list(go, "examples", gAt, (x, xAt) => {
          const xo = obj(x, xAt);
          return {
            from: str(xo, "from", xAt),
            specifier: str(xo, "specifier", xAt),
            line: num(xo, "line", xAt),
            detail: str(xo, "detail", xAt),
          };
        }),
      };
    }),
    deferred: { require: num(obj(get(o, "deferred"), `${at}.deferred`), "require", `${at}.deferred`) },
    configProblems: list(o, "configProblems", at, (p, pAt) => {
      if (typeof p !== "string") fail(pAt, "a string");
      return p;
    }),
  };
}

function fail(at: string, expected: string): never {
  throw new Error(`Parse output does not match the contract: ${at} should be ${expected}`);
}

function obj(v: unknown, at: string): object {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(at, "an object");
  return v;
}

function get(o: object, key: string): unknown {
  const value: unknown = Reflect.get(o, key);
  return value;
}

function str(o: object, key: string, at: string): string {
  const v = get(o, key);
  if (typeof v !== "string") fail(`${at}.${key}`, "a string");
  return v;
}

function num(o: object, key: string, at: string): number {
  const v = get(o, key);
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${at}.${key}`, "a number");
  return v;
}

function bool(o: object, key: string, at: string): boolean {
  const v = get(o, key);
  if (typeof v !== "boolean") fail(`${at}.${key}`, "a boolean");
  return v;
}

function nullable<T>(o: object, key: string, at: string, read: (o: object, key: string, at: string) => T): T | null {
  return get(o, key) === null ? null : read(o, key, at);
}

function member<T extends string>(v: unknown, at: string, values: readonly T[]): T {
  const hit = values.find((x) => x === v);
  if (hit === undefined) fail(at, `one of ${values.join(", ")}`);
  return hit;
}

function oneOf<T extends string>(o: object, key: string, at: string, values: readonly T[]): T {
  return member(get(o, key), `${at}.${key}`, values);
}

function list<T>(o: object, key: string, at: string, item: (v: unknown, at: string) => T): T[] {
  const v = get(o, key);
  if (!Array.isArray(v)) fail(`${at}.${key}`, "an array");
  return v.map((x, i) => item(x, `${at}.${key}[${i}]`));
}
