// The run's vocabulary, shared by the server and the browser. Nothing here
// touches the database or the parser.

import { Constants, type Database } from "@/lib/database.types";

export type AnalysisStatus = Database["public"]["Enums"]["analysis_status"];
export type AnalysisStage = Database["public"]["Enums"]["analysis_stage"];

export const STAGES = Constants.public.Enums.analysis_stage;

export const STAGE_LABEL: Record<AnalysisStage, string> = {
  fetching: "Fetching archive",
  selecting: "Selecting files",
  parsing: "Parsing imports",
  storing: "Storing the graph",
};

// Nothing here has a queue or a timeout, so a process that died mid-run leaves
// a row that will say "parsing" forever. Ten minutes without the stage or its
// message moving is past anything a working run spends in one place.
export const STALE_AFTER_MS = 10 * 60 * 1000;

export function isStale(status: AnalysisStatus, stageChangedAt: string, now: number): boolean {
  return (status === "queued" || status === "running") && now - Date.parse(stageChangedAt) > STALE_AFTER_MS;
}

/** What the database publishes on analysis:<id> whenever the stage moves. */
export interface StageEvent {
  status: AnalysisStatus;
  stage: AnalysisStage | null;
  message: string | null;
}

export function sameEvent(a: StageEvent, b: StageEvent): boolean {
  return a.status === b.status && a.stage === b.stage && a.message === b.message;
}

export function readStageEvent(payload: unknown): StageEvent | null {
  if (typeof payload !== "object" || payload === null) return null;
  const status = Constants.public.Enums.analysis_status.find((s) => s === Reflect.get(payload, "status"));
  const rawStage: unknown = Reflect.get(payload, "stage");
  const stage = rawStage === null ? null : STAGES.find((s) => s === rawStage);
  const message: unknown = Reflect.get(payload, "message");
  if (!status || stage === undefined || (message !== null && typeof message !== "string")) return null;
  return { status, stage, message };
}

/** Thin-space thousands, the same on the server and in every browser. */
export function formatCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
