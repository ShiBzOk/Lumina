"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/spinner";

// Shown while the server reads an analysis. That is usually instant, but a
// large repository's map is tens of thousands of rows and takes seconds. Past
// a moment, it says so, so the wait reads as work rather than a hang.
const EXPLAIN_AFTER_MS = 2500;

export function LoadingAnalysis() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), EXPLAIN_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-2 py-24">
      <p className="flex items-center gap-2 text-xs text-muted">
        <Spinner className="size-3.5" />
        Loading analysis
      </p>
      <p className={`max-w-xs text-center text-[11px] text-muted ${slow ? "" : "invisible"}`}>
        Reading every file, import and edge of a large repository back from the database before the map is drawn.
      </p>
    </div>
  );
}
