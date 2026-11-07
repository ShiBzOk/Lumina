import type { ReactNode } from "react";

/** One cell of a stat strip: the number first and large, its label under it. */
export function Stat({ label, value, note, valueClass = "" }: { label: string; value: ReactNode; note?: string; valueClass?: string }) {
  return (
    <div className="min-w-0 px-2.5 py-2">
      <p className={`font-mono text-[17px] leading-5 font-semibold tabular-nums ${valueClass}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-muted">{label}</p>
      {note && <p className="truncate text-[9.5px] text-muted/80" title={note}>{note}</p>}
    </div>
  );
}

/** Stats read as one unit: a single rounded strip split by hairlines. */
export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="mt-3 grid grid-cols-3 divide-x divide-border rounded-lg bg-background/60 ring-1 ring-border">{children}</div>;
}
