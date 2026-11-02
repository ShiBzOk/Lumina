import fs from "node:fs";
import path from "node:path";
import { isBuiltin } from "node:module";
import { ts } from "ts-morph";
import type { ImportKind, Resolution, SkippedFile } from "./types.ts";
import { SOURCE_EXTENSIONS, message, toPosix, type PackageInfo, type WalkResult } from "./walk.ts";

// Resolution is TypeScript's own algorithm, run with each file's nearest
// tsconfig. The parser never decides two files are connected: either the
// compiler's resolver lands on a real file, or the import is reported with the
// reason it didn't.

interface Config {
  /** Absolute tsconfig/jsconfig path, null when the file has none above it. */
  file: string | null;
  dir: string;
  options: ts.CompilerOptions;
  cache: ts.ModuleResolutionCache;
}

export type Resolver = (specifier: string, fromRel: string, kind: ImportKind) => Resolution;

export function createResolver(
  walk: WalkResult,
  skipped: ReadonlyMap<string, SkippedFile>,
  problems: string[],
): Resolver {
  const { root } = walk;

  const relative = (abs: string): string | null =>
    abs === root ? "." : abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : null;
  const shown = (abs: string): string => relative(abs) ?? abs;

  const excludedByPath = new Map(walk.excluded.map((e) => [e.path, e]));
  const excludedContaining = (rel: string) => {
    for (let p = rel; p !== "."; p = path.posix.dirname(p)) {
      const hit = excludedByPath.get(p);
      if (hit) return hit;
    }
    return null;
  };

  // Workspace packages resolve to their own directory even when nothing is
  // installed, which is the normal state of a fresh clone. The host below
  // answers node_modules lookups for those names from the package's real
  // folder, and TypeScript then applies its usual exports/main/types logic.
  const workspace = new Map<string, string>();
  for (const pkg of walk.packages.values()) {
    if (pkg.name) workspace.set(pkg.name, pkg.dir === "." ? root : `${root}/${pkg.dir}`);
  }
  const scopes = new Set([...workspace.keys()].filter((n) => n.startsWith("@")).map((n) => n.split("/")[0]));

  const mapWorkspace = (p: string): string => {
    const posix = toPosix(p);
    const at = posix.lastIndexOf("/node_modules/");
    if (at === -1 || relative(posix) === null) return posix;
    const rest = posix.slice(at + "/node_modules/".length);
    const name = packageName(rest);
    const dir = workspace.get(name);
    if (!dir || fs.existsSync(posix)) return posix;
    return dir + rest.slice(name.length);
  };

  const realpath = (p: string): string => {
    try {
      return toPosix(fs.realpathSync.native(p));
    } catch {
      return toPosix(p);
    }
  };

  const host: ts.ModuleResolutionHost = {
    fileExists: (p) => ts.sys.fileExists(mapWorkspace(p)),
    readFile: (p) => ts.sys.readFile(mapWorkspace(p)),
    directoryExists: (p) => {
      const posix = toPosix(p);
      if (workspace.size > 0 && relative(posix) !== null) {
        if (posix.endsWith("/node_modules")) return true;
        const scope = /\/node_modules\/(@[^/]+)$/.exec(posix);
        if (scope && scopes.has(scope[1])) return true;
      }
      return ts.sys.directoryExists(mapWorkspace(posix));
    },
    realpath: (p) => realpath(mapWorkspace(p)),
    getDirectories: (p) => ts.sys.getDirectories(mapWorkspace(p)),
    getCurrentDirectory: () => root,
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
  };

  const canonical = (f: string) => (ts.sys.useCaseSensitiveFileNames ? f : f.toLowerCase());

  const loadConfig = (file: string | null, dir: string): Config => {
    let options: ts.CompilerOptions = {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.Preserve,
    };
    if (file) {
      const parsed = ts.getParsedCommandLineOfConfigFile(file, {}, {
        useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
        // Only the compiler options matter here; listing the project's files would be wasted work.
        readDirectory: () => [],
        fileExists: (p) => ts.sys.fileExists(mapWorkspace(p)),
        readFile: (p) => ts.sys.readFile(mapWorkspace(p)),
        getCurrentDirectory: () => root,
        onUnRecoverableConfigFileDiagnostic: (d) => problems.push(`${shown(file)}: ${flatten(d)}`),
      });
      if (parsed) {
        options = parsed.options;
        for (const d of parsed.errors) {
          if (d.code !== 18003) problems.push(`${shown(file)}: ${flatten(d)}`);
        }
      }
    }
    // We map a repository rather than type-check it: JS and JSON files are
    // real files an import can land on, whatever the project's own settings.
    options = { ...options, allowJs: true, resolveJsonModule: true, noEmit: true };
    return { file, dir, options, cache: ts.createModuleResolutionCache(dir, canonical, options) };
  };

  const configs = new Map<string, Config>();
  const configForDir = (dir: string): Config => {
    const cached = configs.get(dir);
    if (cached) return cached;
    const rel = relative(dir);
    const found = ["tsconfig.json", "jsconfig.json"]
      .map((name) => (rel === "." ? name : `${rel}/${name}`))
      .find((f) => walk.files.has(f));
    let config: Config;
    if (found) config = loadConfig(`${root}/${found}`, dir);
    else if (rel === "." || rel === null) config = loadConfig(null, root);
    else config = configForDir(path.posix.dirname(dir));
    configs.set(dir, config);
    return config;
  };
  const configLabel = (c: Config) => (c.file ? shown(c.file) : "default options (no tsconfig)");

  const classify = (resolvedFile: string, specifier: string): Resolution => {
    const target = realpath(resolvedFile);
    const rel = relative(target);
    if (rel === null) return { status: "external", reason: "outside-repo", detail: target };
    // Named after what was imported: "react" can land in @types/react.
    if (rel.split("/").includes("node_modules")) {
      return { status: "external", reason: "package", detail: packageName(specifier) };
    }
    const ignored = excludedContaining(rel);
    if (ignored) {
      return { status: "excluded", reason: "ignored-path", target: rel, detail: `${ignored.path}: ${ignored.reason}, ${ignored.detail}` };
    }
    const skip = skipped.get(rel);
    if (skip) return { status: "excluded", reason: "skipped-file", target: rel, detail: `${skip.reason}: ${skip.detail}` };
    if (walk.files.has(rel)) return { status: "internal", target: rel };
    return { status: "unresolved", reason: "not-in-walk", detail: `${rel} exists but the walk did not list it` };
  };

  const aliasCandidates = (specifier: string, config: Config): { pattern: string; paths: string[] } | null => {
    const paths = config.options.paths;
    if (!paths) return null;
    // Paths are relative to the config that declared them, which may be an extended one.
    const declaredIn = config.options["pathsBasePath"];
    const base = toPosix(config.options.baseUrl ?? (typeof declaredIn === "string" ? declaredIn : config.dir));
    let best: { key: string; captured: string; prefix: number } | null = null;
    for (const key of Object.keys(paths)) {
      const star = key.indexOf("*");
      if (star === -1) {
        if (key === specifier) {
          best = { key, captured: "", prefix: Infinity };
          break;
        }
        continue;
      }
      const prefix = key.slice(0, star);
      const suffix = key.slice(star + 1);
      if (
        specifier.length >= prefix.length + suffix.length &&
        specifier.startsWith(prefix) &&
        specifier.endsWith(suffix) &&
        (!best || prefix.length > best.prefix)
      ) {
        best = { key, captured: specifier.slice(prefix.length, specifier.length - suffix.length), prefix: prefix.length };
      }
    }
    if (!best) return null;
    const { key, captured } = best;
    return { pattern: key, paths: paths[key].map((t) => path.posix.join(base, t.replace("*", captured))) };
  };

  // TypeScript only resolves code and JSON. A stylesheet or image import is
  // still a real import of a real file, so for non-code extensions we follow
  // the same relative-or-alias path TypeScript would, and require the file to exist.
  const resolveAsset = (specifier: string, fromAbs: string, config: Config): string | null => {
    const ext = path.posix.extname(specifier);
    if (!ext || SOURCE_EXTENSIONS.includes(ext)) return null;
    const candidates = isPathLike(specifier)
      ? [specifier.startsWith("/") ? specifier : path.posix.join(path.posix.dirname(fromAbs), specifier)]
      : (aliasCandidates(specifier, config)?.paths ?? []);
    return candidates.find(isFile) ?? null;
  };

  const packagesAbove = (fromRel: string): PackageInfo[] => {
    const found: PackageInfo[] = [];
    for (let dir = path.posix.dirname(fromRel); ; dir = path.posix.dirname(dir)) {
      const pkg = walk.packages.get(dir);
      if (pkg) found.push(pkg);
      if (dir === ".") return found;
    }
  };

  const installed = (fromAbs: string, name: string): boolean => {
    for (let dir = path.posix.dirname(fromAbs); relative(dir) !== null; dir = path.posix.dirname(dir)) {
      if (fs.existsSync(`${dir}/node_modules/${name}`)) return true;
      if (dir === root) break;
    }
    return false;
  };

  const explain = (specifier: string, fromRel: string, fromAbs: string, config: Config): Resolution => {
    if (isPathLike(specifier)) {
      const target = specifier.startsWith("/") ? specifier : path.posix.join(path.posix.dirname(fromAbs), specifier);
      if (!path.posix.extname(specifier) && requiresExtensions(config.options)) {
        const hit = SOURCE_EXTENSIONS.map((e) => target + e).find(isFile);
        if (hit) {
          return {
            status: "unresolved",
            reason: "extension-required",
            detail: `${shown(hit)} exists, but ${configLabel(config)} uses Node16/NodeNext resolution, which needs the extension written out`,
          };
        }
      }
      const query = specifier.includes("?") ? "; the specifier has a query string, which only a bundler understands" : "";
      return {
        status: "unresolved",
        reason: "file-not-found",
        detail: `nothing at ${shown(target)}, with any TS/JS extension or as a directory index${query}`,
      };
    }

    const alias = aliasCandidates(specifier, config);
    if (alias) {
      return {
        status: "unresolved",
        reason: "alias-target-missing",
        detail: `matched "${alias.pattern}" in ${configLabel(config)}, but nothing at ${alias.paths.map(shown).join(", ")}`,
      };
    }

    const name = packageName(specifier);
    const ws = workspace.get(name);
    if (ws) {
      return {
        status: "unresolved",
        reason: "workspace-entry-missing",
        detail: `${name} is the workspace package at ${shown(ws)}, but under ${configLabel(config)} none of its package.json entry points for "${specifier}" exist on disk`,
      };
    }

    const declaring = packagesAbove(fromRel).find((p) => p.dependencies.has(name));
    if (declaring) {
      const at = declaring.dir === "." ? "package.json" : `${declaring.dir}/package.json`;
      return { status: "external", reason: "package", detail: `${name} (declared in ${at}, not installed)` };
    }
    if (installed(fromAbs, name)) {
      return { status: "external", reason: "package", detail: `${name} (installed, but "${specifier}" did not resolve inside it)` };
    }
    const baseUrl = config.options.baseUrl ? `; baseUrl ${shown(toPosix(config.options.baseUrl))} has no such file either` : "";
    return {
      status: "unresolved",
      reason: "undeclared-package",
      detail: `"${name}" is not a relative path, matches no tsconfig paths alias, is not a workspace package, and no package.json declares it${baseUrl}`,
    };
  };

  return (specifier, fromRel, kind) => {
    if (isBuiltin(specifier)) return { status: "external", reason: "builtin", detail: specifier };
    const fromAbs = `${root}/${fromRel}`;
    const config = configForDir(path.posix.dirname(fromAbs));
    const mode =
      kind === "dynamic-import"
        ? ts.ModuleKind.ESNext
        : ts.getImpliedNodeFormatForFile(fromAbs, config.cache.getPackageJsonInfoCache(), host, config.options);
    let resolved: string | undefined;
    try {
      resolved = ts.resolveModuleName(specifier, fromAbs, config.options, host, config.cache, undefined, mode)
        .resolvedModule?.resolvedFileName;
    } catch (error) {
      problems.push(`resolving "${specifier}" from ${fromRel} threw: ${message(error)}`);
    }
    const target = resolved ?? resolveAsset(specifier, fromAbs, config);
    return target ? classify(target, specifier) : explain(specifier, fromRel, fromAbs, config);
  };
}

// Node16/NodeNext resolution either set directly or implied by a `module`
// between Node16 and NodeNext. TypeScript's own helper for this is internal.
function requiresExtensions(options: ts.CompilerOptions): boolean {
  const resolution = options.moduleResolution;
  if (resolution !== undefined) {
    return resolution === ts.ModuleResolutionKind.Node16 || resolution === ts.ModuleResolutionKind.NodeNext;
  }
  const kind = options.module;
  return kind !== undefined && kind >= ts.ModuleKind.Node16 && kind <= ts.ModuleKind.NodeNext;
}

function isPathLike(specifier: string): boolean {
  return specifier === "." || specifier === ".." || /^\.\.?\//.test(specifier) || specifier.startsWith("/");
}

/** "react/jsx-runtime" → "react", "@scope/pkg/sub" → "@scope/pkg". */
function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function flatten(d: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(d.messageText, " ");
}
