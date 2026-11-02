import fs from "node:fs";
import path from "node:path";
import type { SourceFile } from "ts-morph";
import type { NextjsRole } from "../lib/map/frameworks.ts";
import type { FrameworkAdapter, Repository } from "../parser/adapter.ts";
import type { Route, WithheldRoute } from "../parser/types.ts";
import { reactRole } from "./react.ts";
import { exportedNames, hasDirective, lineOf } from "./syntax.ts";

// Next.js says what a file is by where it sits and what it's called. Routes
// come only from app-router route handlers, where the method is the exported
// name and the pattern is the folder path. A page's method is never written in
// its file, so pages get a role and no route.

/** Next.js's default pageExtensions; a config that changes them is caught below. */
const PAGE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];
const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]);
const CONFIG = /^next\.config\.(ts|mts|js|mjs|cjs)$/;
const METADATA = /^(sitemap|robots|manifest|icon\d*|apple-icon\d*|opengraph-image\d*|twitter-image\d*)$/;
const FALLBACK = new Set(["loading", "error", "global-error", "not-found", "global-not-found", "forbidden", "unauthorized", "default"]);

// Config keys that change every URL in the app (a prefix, a locale, a trailing
// slash). Their values can be computed, so their presence alone withholds routes.
const URL_KEYS = ["basePath", "i18n", "trailingSlash"];

interface App {
  dir: string;
  /** Where app/ and pages/ live: the package itself, or its src/ when neither is at the top. */
  base: string;
  /** Why none of this app's routes can be stated exactly, or null. */
  urlsWithheld: string | null;
  /** Set when pageExtensions is changed: then a file's name no longer says whether it's a page. */
  namesUnknown: WithheldRoute | null;
}

export const nextjsAdapter = {
  name: "nextjs",
  detect(repo) {
    const apps = [...repo.packages.values()].filter((p) => p.dependencies.has("next")).map((p) => readApp(repo, p.dir));
    if (apps.length === 0) return null;
    // Innermost first, so a file belongs to the nearest app above it.
    apps.sort((a, b) => b.dir.length - a.dir.length);
    const routes: Route[] = [];
    const withheld: WithheldRoute[] = [];
    for (const app of apps) if (app.namesUnknown) withheld.push(app.namesUnknown);

    return {
      read(file, source) {
        const app = apps.find((a) => within(file, a.dir));
        const role = app ? conventionRole(app, file, source, routes, withheld) : null;
        return role ?? (hasDirective(source, "use server") ? "action" : reactRole(file, source));
      },
      routes: () => ({
        routes: routes.sort((a, b) => compare(a.pattern, b.pattern) || compare(a.method, b.method)),
        withheld,
      }),
    };
  },
} satisfies FrameworkAdapter;

function readApp(repo: Repository, dir: string): App {
  const at = (sub: string) => (dir === "." ? sub : `${dir}/${sub}`);
  const has = (folder: string) => [...repo.files].some((f) => f.startsWith(`${folder}/`));
  // Next.js ignores src/app and src/pages when app/ or pages/ is at the top.
  const base = has(at("app")) || has(at("pages")) ? dir : at("src");

  const config = [...repo.files].find((f) => path.posix.dirname(f) === dir && CONFIG.test(path.posix.basename(f)));
  if (!config) return { dir, base, urlsWithheld: null, namesUnknown: null };
  let text: string;
  try {
    text = fs.readFileSync(`${repo.root}/${config}`, "utf8");
  } catch {
    return { dir, base, urlsWithheld: `${config} could not be read, so whether it changes every URL isn't known`, namesUnknown: null };
  }
  const key = URL_KEYS.find((k) => lineOf(text, k) !== null);
  const extensions = lineOf(text, "pageExtensions");
  return {
    dir,
    base,
    urlsWithheld: key ? `${config}:${lineOf(text, key)} sets ${key}, which changes every URL in this app` : null,
    namesUnknown:
      extensions === null
        ? null
        : {
            file: config,
            line: extensions,
            reason: "pageExtensions is changed, so a file's name no longer says whether it is a page or a route; none of this app's are named",
          },
  };
}

function conventionRole(app: App, file: string, source: SourceFile, routes: Route[], withheld: WithheldRoute[]): NextjsRole | null {
  const name = path.posix.basename(file);
  const ext = path.posix.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  if (path.posix.dirname(file) === app.dir && CONFIG.test(name)) return "config";
  if (!within(file, app.base) || !PAGE_EXTENSIONS.includes(ext)) return null;

  const rel = app.base === "." ? file : file.slice(app.base.length + 1);
  const [top, ...rest] = rel.split("/");
  if (rest.length === 0) {
    if (stem === "middleware" || stem === "proxy") return "middleware";
    if (stem === "instrumentation" || stem === "instrumentation-client") return "config";
    return null;
  }
  if (app.namesUnknown) return null;
  const folders = rest.slice(0, -1);

  if (top === "app") {
    // A private folder and everything under it is left out of routing.
    if (folders.some((f) => f.startsWith("_"))) return null;
    if (stem === "page") return "page";
    if (stem === "layout" || stem === "template") return "layout";
    if (FALLBACK.has(stem)) return "fallback";
    if (METADATA.test(stem)) return "metadata";
    if (stem === "route") {
      routeHandler(app, file, folders, source, routes, withheld);
      return "api";
    }
    return null;
  }

  if (top === "pages") {
    if (rest[0] === "api" && rest.length > 1) {
      withheld.push({ file, line: 1, reason: "a pages/api handler reads its method from req.method at runtime" });
      return "api";
    }
    if (rest.length === 1 && (stem === "_app" || stem === "_document")) return "layout";
    if (rest.length === 1 && (stem === "_error" || stem === "404" || stem === "500")) return "fallback";
    return "page";
  }
  return null;
}

function routeHandler(app: App, file: string, folders: string[], source: SourceFile, routes: Route[], withheld: WithheldRoute[]) {
  if (app.urlsWithheld) {
    withheld.push({ file, line: 1, reason: app.urlsWithheld });
    return;
  }
  const kept: string[] = [];
  for (const folder of folders) {
    if (folder.startsWith("(.)") || folder.startsWith("(..)") || folder.startsWith("(...)")) {
      withheld.push({ file, line: 1, reason: `${folder} intercepts another route, so the URL it answers depends on where navigation came from` });
      return;
    }
    // Route groups and parallel-route slots organise folders without adding to the URL.
    if ((folder.startsWith("(") && folder.endsWith(")")) || folder.startsWith("@")) continue;
    kept.push(folder);
  }
  const pattern = `/${kept.join("/")}`;

  const { names, star } = exportedNames(source);
  const handlers = names.filter((n) => !n.isDefault && HTTP_METHODS.has(n.name));
  for (const h of handlers) routes.push({ file, line: h.line, method: h.name, pattern });
  if (star !== null) {
    withheld.push({ file, line: star, reason: "export * may add handlers this file doesn't name" });
  } else if (handlers.length === 0) {
    withheld.push({ file, line: 1, reason: "exports no handler named after an HTTP method" });
  }
}

function within(file: string, dir: string): boolean {
  return dir === "." || file.startsWith(`${dir}/`);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
