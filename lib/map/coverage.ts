// How complete the drawn graph is, from the parser's own coverage report.
// Pure: the report in, a figure out.

import type { Coverage } from "../../parser/types.ts";

export interface CoverageFigure {
  /** Of the imports pointing into the repository, the share that became an edge. Rounded down. */
  percent: number;
  resolved: number;
  /** Imports aimed at a file in the repository, whether or not they got there. Packages and builtins are not. */
  intoRepo: number;
  /** True whenever anything is missing from the graph, however little. */
  partial: boolean;
}

export function coverageFigure(c: Coverage): CoverageFigure {
  const { internal, excluded, unresolved } = c.imports;
  // An excluded import reached a real file the graph deliberately leaves out,
  // so it is a missing edge too, not a resolved one.
  const intoRepo = internal + excluded + unresolved;
  // Rounded down, so a graph missing a single edge can never read as 100%.
  const percent = intoRepo === 0 ? 100 : Math.floor((internal / intoRepo) * 1000) / 10;
  return {
    percent,
    resolved: internal,
    intoRepo,
    partial: internal < intoRepo || c.filesSkipped > 0 || c.syntaxErrors.length > 0,
  };
}
