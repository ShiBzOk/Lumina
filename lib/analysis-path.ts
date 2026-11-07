// Where an analysis lives: its repository and version, which is what people
// call it. A version number is handed out once and never reused, so this
// names one analysis for as long as that analysis is kept.

/**
 * The app's own top-level paths. A GitHub owner with one of these names would
 * collide with a page of the app, so that repository keeps the id address.
 * GitHub owners are letters, digits and hyphens, so nothing else here clashes.
 */
const RESERVED = new Set(["analyses", "sign-in", "sign-up", "onboarding"]);

export interface AnalysisAddress {
  id: string;
  owner: string;
  name: string;
  version: number;
}

export function analysisPath({ id, owner, name, version }: AnalysisAddress): string {
  if (RESERVED.has(owner.toLowerCase())) return `/analyses/${id}`;
  return `/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/v${version}`;
}

/** "v3" → 3. Anything else is not a version and reads as absent. */
export function parseVersion(segment: string): number | null {
  const m = /^v([1-9]\d{0,8})$/.exec(segment);
  return m ? Number(m[1]) : null;
}
