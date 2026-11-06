"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { rerunAnalysis } from "@/app/analyses/actions";
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

/** Re-runs the same analysis at the branch's tip; the run lands on its progress page. */
export function RemapButton({ analysisId, className }: { analysisId: string; className: string }) {
  return (
    <form action={rerunAnalysis.bind(null, analysisId)} className="shrink-0">
      <Submit className={className} />
    </form>
  );
}

function Submit({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`flex items-center gap-1 disabled:opacity-60 ${className}`}>
      <Icon name="refresh" className="size-3" />
      {pending ? "Starting…" : "Re-map"}
    </button>
  );
}
