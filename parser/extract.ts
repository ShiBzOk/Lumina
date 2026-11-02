import { Node, SyntaxKind, type SourceFile } from "ts-morph";
import type { ImportKind } from "./types.ts";

export interface FoundImport {
  /** The literal specifier, or null when a dynamic import's argument is an expression. */
  specifier: string | null;
  /** What was written, for reporting non-literal dynamic imports. */
  text: string;
  kind: ImportKind;
  typeOnly: boolean;
  line: number;
}

export interface Extraction {
  imports: FoundImport[];
  /** require() and `import x = require()` calls: deferred, counted, not resolved. */
  requireCalls: number;
  syntaxErrors: number;
}

// Walks every node rather than only top-level statements, so imports inside
// `declare module` blocks and dynamic imports anywhere in a function are seen.
export function extractImports(file: SourceFile): Extraction {
  const imports: FoundImport[] = [];
  let requireCalls = 0;

  file.forEachDescendant((node) => {
    if (Node.isImportDeclaration(node)) {
      const named = node.getNamedImports();
      const typeOnly =
        node.isTypeOnly() ||
        (named.length > 0 &&
          !node.getDefaultImport() &&
          !node.getNamespaceImport() &&
          named.every((n) => n.isTypeOnly()));
      const specifier = node.getModuleSpecifierValue();
      imports.push({ specifier, text: specifier, kind: "import", typeOnly, line: node.getStartLineNumber() });
    } else if (Node.isExportDeclaration(node)) {
      // `export { a }` with no `from` re-exports a local binding, not a module.
      const specifier = node.getModuleSpecifierValue();
      if (specifier === undefined) return;
      const named = node.getNamedExports();
      const typeOnly = node.isTypeOnly() || (named.length > 0 && named.every((n) => n.isTypeOnly()));
      imports.push({ specifier, text: specifier, kind: "re-export", typeOnly, line: node.getStartLineNumber() });
    } else if (Node.isImportTypeNode(node)) {
      // `typeof import("./x")` in a type position: a real, type-only reference to a module.
      const argument = node.getArgument();
      if (Node.isLiteralTypeNode(argument)) {
        const literal = argument.getLiteral();
        if (Node.isStringLiteral(literal)) {
          const specifier = literal.getLiteralValue();
          imports.push({ specifier, text: specifier, kind: "import", typeOnly: true, line: node.getStartLineNumber() });
        }
      }
    } else if (Node.isImportEqualsDeclaration(node)) {
      if (Node.isExternalModuleReference(node.getModuleReference())) requireCalls += 1;
    } else if (Node.isCallExpression(node)) {
      const callee = node.getExpression();
      if (callee.getKind() === SyntaxKind.ImportKeyword) {
        const [argument] = node.getArguments();
        const line = node.getStartLineNumber();
        if (argument && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument))) {
          const specifier = argument.getLiteralValue();
          imports.push({ specifier, text: specifier, kind: "dynamic-import", typeOnly: false, line });
        } else {
          imports.push({ specifier: null, text: argument?.getText() ?? "", kind: "dynamic-import", typeOnly: false, line });
        }
      } else if (Node.isIdentifier(callee) && callee.getText() === "require") {
        requireCalls += 1;
      }
    }
  });

  return { imports, requireCalls, syntaxErrors: syntaxErrorCount(file) };
}

// TypeScript keeps parse errors on the source file but doesn't expose them in
// its public types. Reading them without a full program build is the cheap way
// to say "this file parsed, but not cleanly".
function syntaxErrorCount(file: SourceFile): number {
  const raw: object = file.compilerNode;
  const diagnostics = "parseDiagnostics" in raw ? raw.parseDiagnostics : undefined;
  return Array.isArray(diagnostics) ? diagnostics.length : 0;
}
