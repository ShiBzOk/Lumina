// The rail's categories, per framework. Plain data with no imports, so the
// browser can read it without pulling in a parser, and the adapters type their
// output against it so a role can't exist that the rail has no place for.
//
// Order is reading order and never changes: the surfaces a request reaches
// first, then the layers behind them, then plumbing.

export interface RoleCategory {
  /** What is stored for a file. */
  role: string;
  /** The rail's name for the category: the framework's own word, plural. */
  label: string;
  /**
   * Reached by the framework itself rather than by an import, so nothing
   * importing one of these says nothing about whether it is used.
   */
  entry: boolean;
}

export interface Framework {
  adapter: string;
  label: string;
  categories: readonly RoleCategory[];
  /** Said under the route table when something visible in the rail isn't in it. */
  routesNote: string | null;
}

export const REACT_CATEGORIES = [
  { role: "component", label: "Components", entry: false },
  { role: "hook", label: "Hooks", entry: false },
] as const satisfies readonly RoleCategory[];

export const NEXTJS_CATEGORIES = [
  { role: "page", label: "Page routes", entry: true },
  { role: "api", label: "API endpoints", entry: true },
  { role: "action", label: "Server actions", entry: false },
  { role: "metadata", label: "Metadata routes", entry: true },
  { role: "layout", label: "Layouts", entry: true },
  { role: "fallback", label: "Loading & error UI", entry: true },
  ...REACT_CATEGORIES,
  { role: "middleware", label: "Middleware", entry: true },
  { role: "config", label: "Config", entry: true },
] as const satisfies readonly RoleCategory[];

export const NESTJS_CATEGORIES = [
  { role: "controller", label: "Controllers", entry: false },
  { role: "resolver", label: "Resolvers", entry: false },
  { role: "gateway", label: "Gateways", entry: false },
  { role: "service", label: "Services", entry: false },
  { role: "repository", label: "Repositories", entry: false },
  { role: "entity", label: "Entities", entry: false },
  { role: "dto", label: "DTOs", entry: false },
  { role: "module", label: "Modules", entry: false },
  { role: "guard", label: "Guards", entry: false },
  { role: "interceptor", label: "Interceptors", entry: false },
  { role: "pipe", label: "Pipes", entry: false },
  { role: "filter", label: "Filters", entry: false },
  { role: "middleware", label: "Middleware", entry: false },
  { role: "strategy", label: "Strategies", entry: false },
  { role: "decorator", label: "Decorators", entry: false },
] as const satisfies readonly RoleCategory[];

export type ReactRole = (typeof REACT_CATEGORIES)[number]["role"];
export type NextjsRole = (typeof NEXTJS_CATEGORIES)[number]["role"];
export type NestjsRole = (typeof NESTJS_CATEGORIES)[number]["role"];

export const FRAMEWORKS: readonly Framework[] = [
  {
    adapter: "nextjs",
    label: "Next.js",
    categories: NEXTJS_CATEGORIES,
    routesNote: "Pages aren't listed: a page's method isn't written in its file.",
  },
  { adapter: "nestjs", label: "NestJS", categories: NESTJS_CATEGORIES, routesNote: null },
  {
    adapter: "react",
    label: "React",
    categories: REACT_CATEGORIES,
    routesNote: "A React router builds its routes at runtime, so none can be read from the source.",
  },
];

/** Null for the fallback, which has no categories. */
export function frameworkOf(adapter: string): Framework | null {
  return FRAMEWORKS.find((f) => f.adapter === adapter) ?? null;
}
