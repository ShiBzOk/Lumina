"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { remapAnalysis, type RemapState } from "@/app/analyses/actions";
import { Icon } from "@/components/map/icons";
import { readHeadCheck, type HeadCheck } from "@/lib/head-check";

/** Asks once, when shown, whether the branch has moved past what was mapped. Null until it answers. */
export function useHeadCheck(analysisId: string, enabled: boolean): HeadCheck | null {
  const [check, setCheck] = useState<{ id: string; result: HeadCheck } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    fetch(`/analyses/${analysisId}/head`, { signal: abort.signal })
      .then(async (res) => {
        const result = res.ok ? readHeadCheck(await res.json()) : null;
        setCheck({
          id: analysisId,
          result: result ?? { state: "unknown", reason: `The check answered HTTP ${res.status} without a result` },
        });
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        setCheck({ id: analysisId, result: { state: "unknown", reason: error instanceof Error ? error.message : String(error) } });
      });
    return () => abort.abort();
  }, [analysisId, enabled]);
  // Keyed by id, so switching repositories never shows the previous one's answer.
  return enabled && check?.id === analysisId ? check.result : null;
}

const NO_ERROR: RemapState = { error: null };

/**
 * Analyses the branch's tip as a new analysis beside this one, landing on its
 * progress, or on the existing analysis if that commit already has one. If
 * GitHub refuses the lookup, nothing is created and its reason shows here.
 */
export function RemapButton({ analysisId, className }: { analysisId: string; className: string }) {
  const remap = useMemo(() => remapAnalysis.bind(null, analysisId), [analysisId]);
  const [state, action, pending] = useActionState(remap, NO_ERROR);
  return (
    <form action={action} className="flex min-w-0 shrink-0 items-center gap-2">
      {state.error && (
        <span className="max-w-72 truncate text-[11px] text-danger" title={state.error}>
          {state.error}
        </span>
      )}
      <button type="submit" disabled={pending} data-tip="Map the branch's latest commit as a new version; this one is kept" className={`flex shrink-0 items-center gap-1 disabled:opacity-60 ${className}`}>
        <Icon name="refresh" className="size-3" />
        {pending ? "Starting…" : "Re-map"}
      </button>
    </form>
  );
}
