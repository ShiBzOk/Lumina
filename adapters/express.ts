import type { ExpressRole } from "../lib/map/frameworks.ts";
import type { FrameworkAdapter } from "../parser/adapter.ts";

// Express has no conventions of its own, but its repositories share one: a
// file's role is the folder it sits in. Real repositories spell those folders
// both singular and plural, so both are accepted.
//
// No routes. Express assembles them at runtime from routers, variables and
// middleware chains, so a path read from one call is never known to be whole.

const FOLDERS: ReadonlyMap<string, ExpressRole> = new Map([
  ["routes", "router"],
  ["route", "router"],
  ["routers", "router"],
  ["router", "router"],
  ["controllers", "controller"],
  ["controller", "controller"],
  ["services", "service"],
  ["service", "service"],
  ["models", "model"],
  ["model", "model"],
  ["middlewares", "middleware"],
  ["middleware", "middleware"],
  ["configs", "config"],
  ["config", "config"],
]);

// tests/routes/users.test.js exercises a router without being one.
const TEST = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

export const expressAdapter = {
  name: "express",
  detect: (repo) =>
    [...repo.packages.values()].some((p) => p.dependencies.has("express"))
      ? { read: roleOf, routes: () => ({ routes: [], withheld: [] }) }
      : null,
} satisfies FrameworkAdapter;

/** The innermost folder that names a role, so routes/admin/users.js is still a router. */
function roleOf(file: string): ExpressRole | null {
  if (TEST.test(file)) return null;
  const folders = file.split("/").slice(0, -1);
  for (let i = folders.length - 1; i >= 0; i--) {
    const role = FOLDERS.get(folders[i].toLowerCase());
    if (role) return role;
  }
  return null;
}
