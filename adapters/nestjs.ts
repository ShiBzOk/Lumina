import path from "node:path";
import { Node, type Decorator, type SourceFile } from "ts-morph";
import { NESTJS_CATEGORIES, type NestjsRole } from "../lib/map/frameworks.ts";
import type { FrameworkAdapter } from "../parser/adapter.ts";
import type { Route, WithheldRoute } from "../parser/types.ts";
import { namedImports, stringLiterals } from "./syntax.ts";

// NestJS names a file's role in its suffix (cats.controller.ts), and builds a
// route from two decorators: the controller's path and the method's. A route
// is emitted only when both are literals and nothing elsewhere in the
// repository (versioning, RouterModule, a conditional global prefix) changes
// the path in a way the source alone can't settle.

const ROLES: readonly NestjsRole[] = NESTJS_CATEGORIES.map((c) => c.role);
const HTTP_DECORATORS = new Set(["Get", "Post", "Put", "Delete", "Patch", "Options", "Head", "All", "Search"]);

/** A route still waiting for the global prefix, which may sit in another file. */
interface Pending {
  file: string;
  line: number;
  method: string;
  path: string;
}

interface Located {
  file: string;
  line: number;
}

export const nestjsAdapter = {
  name: "nestjs",
  detect(repo) {
    if (![...repo.packages.values()].some((p) => p.dependencies.has("@nestjs/core"))) return null;
    const pending: Pending[] = [];
    const withheld: WithheldRoute[] = [];
    const prefixes: (Located & { value: string })[] = [];
    // Anything that changes every path in a way the source can't settle.
    const blockers: (Located & { reason: string })[] = [];
    let bootstraps = 0;

    return {
      read(file, source) {
        const text = source.getFullText();
        if (text.includes("@nestjs/common")) readControllers(file, source, pending, withheld);
        if (namedImports(source, "@nestjs/core").has("RouterModule")) {
          blockers.push({ file, line: 1, reason: "RouterModule mounts modules under paths set at runtime" });
        }
        if (/setGlobalPrefix|enableVersioning|NestFactory/.test(text)) {
          source.forEachDescendant((node) => {
            if (!Node.isCallExpression(node)) return;
            const callee = node.getExpression();
            if (!Node.isPropertyAccessExpression(callee)) return;
            const line = node.getStartLineNumber();
            const name = callee.getName();
            if (name === "create" && callee.getExpression().getText() === "NestFactory") bootstraps += 1;
            if (name === "enableVersioning") blockers.push({ file, line, reason: "versioning puts a version into paths" });
            if (name !== "setGlobalPrefix") return;
            const args = node.getArguments();
            const value = args.length === 1 && !Node.isArrayLiteralExpression(args[0]) ? stringLiterals(args[0])?.[0] : undefined;
            // Only a plain statement in the bootstrap function always runs; inside a
            // branch, or with an exclude list, which routes it prefixes isn't fixed.
            const statement = node.getParent();
            const standalone =
              Node.isExpressionStatement(statement) &&
              Node.isBlock(statement.getParent()) &&
              Node.isFunctionLikeDeclaration(statement.getParent()?.getParent());
            if (value !== undefined && standalone) prefixes.push({ file, line, value });
            else blockers.push({ file, line, reason: "the global prefix is computed, conditional, or excludes some routes" });
          });
        }
        return roleOf(file);
      },

      routes() {
        const all = [...blockers];
        if (prefixes.length > 1) all.push({ ...prefixes[1], reason: "setGlobalPrefix is called more than once" });
        if (prefixes.length === 1 && bootstraps > 1) {
          all.push({ ...prefixes[0], reason: "more than one application is bootstrapped, so which one this prefix applies to isn't known" });
        }
        const blocker = all[0];
        if (blocker) {
          const reason = `${blocker.reason} (${blocker.file}:${blocker.line})`;
          return { routes: [], withheld: [...withheld, ...pending.map((p) => ({ file: p.file, line: p.line, reason }))] };
        }
        const prefix = prefixes[0]?.value ?? "";
        const routes: Route[] = pending.map((p) => ({ file: p.file, line: p.line, method: p.method, pattern: join(prefix, p.path) }));
        routes.sort((a, b) => compare(a.pattern, b.pattern) || compare(a.method, b.method));
        return { routes, withheld };
      },
    };
  },
} satisfies FrameworkAdapter;

function roleOf(file: string): NestjsRole | null {
  // The suffix is the last dotted part before the extension, so
  // cats.controller.spec.ts is a test, not a controller.
  const suffix = /\.([a-z]+)\.[cm]?[jt]s$/.exec(path.posix.basename(file))?.[1];
  return ROLES.find((r) => r === suffix) ?? null;
}

function readControllers(file: string, source: SourceFile, pending: Pending[], withheld: WithheldRoute[]) {
  // Only decorators imported from @nestjs/common count, under whatever local name.
  const imported = namedImports(source, "@nestjs/common");
  const named = (d: Decorator) => imported.get(d.getName());

  for (const cls of source.getClasses()) {
    const controller = cls.getDecorators().find((d) => named(d) === "Controller");
    if (!controller) continue;
    const at = { file, line: controller.getStartLineNumber() };
    const prefixes = cls.getDecorators().some((d) => named(d) === "Version")
      ? "the controller is versioned, which puts a version into its paths"
      : controllerPaths(controller);

    for (const method of cls.getMethods()) {
      const versioned = method.getDecorators().some((d) => named(d) === "Version");
      for (const decorator of method.getDecorators()) {
        const verb = named(decorator);
        if (verb === undefined || !HTTP_DECORATORS.has(verb)) continue;
        const line = decorator.getStartLineNumber();
        const paths = versioned ? "the method is versioned, which puts a version into its path" : decoratorPaths(decorator);
        if (typeof prefixes === "string") {
          withheld.push({ file, line, reason: `${prefixes} (line ${at.line})` });
          continue;
        }
        if (typeof paths === "string") {
          withheld.push({ file, line, reason: paths });
          continue;
        }
        for (const prefix of prefixes) for (const p of paths) pending.push({ file, line, method: verb.toUpperCase(), path: join(prefix, p) });
      }
    }
  }
}

/** @Controller(), @Controller('cats'), @Controller(['a', 'b']) or @Controller({ path, host }). */
function controllerPaths(decorator: Decorator): string[] | string {
  const args = decorator.getArguments();
  if (args.length === 0) return [""];
  const [arg] = args;
  if (args.length === 1 && !Node.isObjectLiteralExpression(arg)) return stringLiterals(arg) ?? "the controller's path is computed";
  if (args.length !== 1 || !Node.isObjectLiteralExpression(arg)) return "the controller's arguments aren't a path";
  let paths = [""];
  for (const property of arg.getProperties()) {
    if (!Node.isPropertyAssignment(property)) return "the controller's options are computed";
    const key = property.getName();
    if (key === "version") return "the controller is versioned, which puts a version into its paths";
    if (key !== "path") continue;
    const value = property.getInitializer();
    const literal = value ? stringLiterals(value) : null;
    if (!literal) return "the controller's path is computed";
    paths = literal;
  }
  return paths;
}

/** @Get(), @Get(':id') or @Get(['a', 'b']). */
function decoratorPaths(decorator: Decorator): string[] | string {
  const args = decorator.getArguments();
  if (args.length === 0) return [""];
  return (args.length === 1 && stringLiterals(args[0])) || "the method's path is computed";
}

/** Nest joins path parts with single slashes and ignores empty ones. */
function join(...parts: string[]): string {
  return `/${parts
    .flatMap((p) => p.split("/"))
    .filter(Boolean)
    .join("/")}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
