import { Node, type SourceFile } from "ts-morph";

// Reading a file's own statements, nothing more. No type checker and no other
// file: what a file exports is what its statements say it exports.

export interface ExportedName {
  name: string;
  line: number;
  /** Re-exported from another module rather than declared here. */
  reexport: boolean;
  /** `export default function name()`: the name is the function's, the export is "default". */
  isDefault: boolean;
}

export interface Exports {
  names: ExportedName[];
  /** Line of the first `export * from`, whose names this file doesn't list. */
  star: number | null;
}

export function exportedNames(source: SourceFile): Exports {
  const names: ExportedName[] = [];
  let star: number | null = null;
  const add = (name: string, node: Node, reexport = false, isDefault = false) =>
    names.push({ name, line: node.getStartLineNumber(), reexport, isDefault });

  for (const statement of source.getStatements()) {
    if (Node.isFunctionDeclaration(statement) && statement.hasExportKeyword()) {
      const name = statement.getName();
      if (name) add(name, statement, false, statement.hasDefaultKeyword());
    } else if (Node.isVariableStatement(statement) && statement.hasExportKeyword()) {
      for (const declaration of statement.getDeclarations()) {
        const binding = declaration.getNameNode();
        if (Node.isIdentifier(binding)) add(binding.getText(), declaration);
        // `export const { GET, POST } = handlers` exports exactly the names bound.
        else if (Node.isObjectBindingPattern(binding)) for (const element of binding.getElements()) add(element.getName(), element);
      }
    } else if (Node.isExportDeclaration(statement)) {
      const reexport = statement.getModuleSpecifier() !== undefined;
      if (!statement.hasNamedExports()) {
        if (reexport && !statement.getNamespaceExport()) star ??= statement.getStartLineNumber();
        continue;
      }
      for (const named of statement.getNamedExports()) add(named.getAliasNode()?.getText() ?? named.getName(), named, reexport);
    }
  }
  return { names, star };
}

/** Whether the file's directive prologue holds this directive, e.g. "use server". */
export function hasDirective(source: SourceFile, directive: string): boolean {
  for (const statement of source.getStatements()) {
    if (!Node.isExpressionStatement(statement)) return false;
    const expression = statement.getExpression();
    if (!Node.isStringLiteral(expression)) return false;
    if (expression.getLiteralValue() === directive) return true;
  }
  return false;
}

/** A string literal, or an array of nothing but string literals; null for anything computed. */
export function stringLiterals(node: Node): string[] | null {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) return [node.getLiteralValue()];
  if (Node.isArrayLiteralExpression(node)) {
    const values: string[] = [];
    for (const element of node.getElements()) {
      if (!Node.isStringLiteral(element) && !Node.isNoSubstitutionTemplateLiteral(element)) return null;
      values.push(element.getLiteralValue());
    }
    return values.length > 0 ? values : null;
  }
  return null;
}

/** Local name → imported name, for the named imports from one module. */
export function namedImports(source: SourceFile, module: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const declaration of source.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== module) continue;
    for (const named of declaration.getNamedImports()) names.set(named.getAliasNode()?.getText() ?? named.getName(), named.getName());
  }
  return names;
}

/** 1-based line of the first whole-word occurrence of `word`, or null. */
export function lineOf(text: string, word: string): number | null {
  const match = new RegExp(`\\b${word}\\b`).exec(text);
  return match ? text.slice(0, match.index).split("\n").length : null;
}
