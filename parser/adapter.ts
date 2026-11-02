// Framework knowledge lives behind this interface and nowhere else. The parser
// asks an adapter what a file *means* (a page, a route handler…); it never
// asks which framework it is looking at.

export interface FrameworkAdapter {
  readonly name: string;
  /** Whether this framework is present in the repository at `root`. */
  detect(root: string): boolean;
  /** A label for what the framework says this file is, or null when convention says nothing. */
  describeFile(path: string, source: string): string | null;
}

/** Assumes no framework at all: every repository qualifies, no file gets a role. */
export const fallbackAdapter: FrameworkAdapter = {
  name: "none",
  detect: () => true,
  describeFile: () => null,
};

/** First adapter that recognises the repository, otherwise the fallback. */
export function selectAdapter(root: string, adapters: readonly FrameworkAdapter[]): FrameworkAdapter {
  return adapters.find((a) => a.detect(root)) ?? fallbackAdapter;
}
