import { Node, type SourceFile } from "ts-morph";
import type { ReactRole } from "../lib/map/frameworks.ts";
import type { FrameworkAdapter } from "../parser/adapter.ts";
import { exportedNames } from "./syntax.ts";

// React has no file conventions, so its roles come from syntax alone, and it
// has no routes: a router's table is built at runtime, so nothing here is exact.

// Tests and stories render components without being one.
const NOT_SOURCE = /(^|\/)__tests__\/|\.(test|spec|stories|story)\.[cm]?[jt]sx?$/;
// React's own rule for what counts as a hook.
const HOOK = /^use[A-Z0-9]/;

/** Shared with every adapter for a framework built on React. */
export function reactRole(path: string, source: SourceFile): ReactRole | null {
  if (NOT_SOURCE.test(path)) return null;
  // A barrel that re-exports a hook isn't one.
  if (exportedNames(source).names.some((n) => !n.reexport && HOOK.test(n.name))) return "hook";
  const jsx = source.getFirstDescendant((n) => Node.isJsxElement(n) || Node.isJsxSelfClosingElement(n) || Node.isJsxFragment(n));
  return jsx ? "component" : null;
}

export const reactAdapter = {
  name: "react",
  detect: (repo) =>
    [...repo.packages.values()].some((p) => p.dependencies.has("react"))
      ? { read: reactRole, routes: () => ({ routes: [], withheld: [] }) }
      : null,
} satisfies FrameworkAdapter;
