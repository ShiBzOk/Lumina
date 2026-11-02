import fs from "node:fs";
import path from "node:path";
import { matchIgnore, parseGitignore, type IgnoreRule } from "./gitignore.ts";
import type { ExcludedPath } from "./types.ts";

// File selection is structural: keep every directory git would keep, and every
// source file inside it. Never a "largest N files" cut, which keeps a file and
// drops the leaf it imports.

export const SOURCE_EXTENSIONS: readonly string[] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export interface PackageInfo {
  /** Repository-relative directory, "." at the root. */
  dir: string;
  name: string | null;
  /** Every name in dependencies, devDependencies, peerDependencies, optionalDependencies. */
  dependencies: Set<string>;
}

export interface WalkResult {
  /** Absolute, forward slashes, real casing. */
  root: string;
  /** Every file kept by the walk, repository-relative. */
  files: Set<string>;
  /** The subset of `files` that gets parsed, sorted. */
  sources: string[];
  excluded: ExcludedPath[];
  packages: Map<string, PackageInfo>;
  problems: string[];
}

export function isSourceFile(rel: string): boolean {
  return SOURCE_EXTENSIONS.includes(path.posix.extname(rel));
}

export function walkRepository(dir: string): WalkResult {
  const root = toPosix(fs.realpathSync.native(path.resolve(dir)));
  const result: WalkResult = {
    root,
    files: new Set(),
    sources: [],
    excluded: [],
    packages: new Map(),
    problems: [],
  };
  visit(result, "", []);
  result.sources = [...result.files].filter(isSourceFile).sort();
  return result;
}

function visit(result: WalkResult, rel: string, inherited: readonly IgnoreRule[]): void {
  const abs = rel ? `${result.root}/${rel}` : result.root;
  let rules = inherited;
  const gitignore = `${abs}/.gitignore`;
  if (fs.existsSync(gitignore)) {
    rules = [...inherited, ...parseGitignore(fs.readFileSync(gitignore, "utf8"), rel)];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch (error) {
    result.problems.push(`could not read directory ${rel || "."}: ${message(error)}`);
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) {
      result.excluded.push({ path: child, reason: "symlink", detail: "symbolic links are not followed" });
      continue;
    }
    const isDir = entry.isDirectory();
    if (isDir && entry.name === ".git") {
      result.excluded.push({ path: child, reason: "vcs", detail: "git metadata" });
      continue;
    }
    if (isDir && entry.name === "node_modules") {
      result.excluded.push({ path: child, reason: "dependencies", detail: "installed packages" });
      continue;
    }
    const rule = matchIgnore(rules, child, isDir);
    if (rule) {
      result.excluded.push({ path: child, reason: "gitignored", detail: `${rule.pattern} (${rule.source})` });
      continue;
    }
    if (isDir) {
      visit(result, child, rules);
    } else if (entry.isFile()) {
      result.files.add(child);
      if (entry.name === "package.json") readPackage(result, rel || ".", `${abs}/package.json`);
    }
  }
}

function readPackage(result: WalkResult, dir: string, file: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    result.problems.push(`${dir}/package.json is not valid JSON: ${message(error)}`);
    return;
  }
  if (typeof parsed !== "object" || parsed === null) return;
  const name: unknown = Reflect.get(parsed, "name");
  const dependencies = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const block: unknown = Reflect.get(parsed, field);
    if (typeof block === "object" && block !== null) {
      for (const key of Object.keys(block)) dependencies.add(key);
    }
  }
  result.packages.set(dir, { dir, name: typeof name === "string" ? name : null, dependencies });
}

/** Nearest package directory at or above a repository-relative file. */
export function packageOf(packages: ReadonlyMap<string, PackageInfo>, rel: string): PackageInfo | null {
  let dir = path.posix.dirname(rel);
  for (;;) {
    const found = packages.get(dir);
    if (found) return found;
    if (dir === ".") return null;
    dir = path.posix.dirname(dir);
  }
}

export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
