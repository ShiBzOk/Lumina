// The one thing that moves without being touched: work the user started and is
// waiting on. A ring with one dark side, turning. Under reduced motion it holds
// still, and the text beside it still says what is happening.
export function Spinner({ className = "size-4", tone = "petrol" }: { className?: string; tone?: "petrol" | "white" }) {
  const ring = tone === "white" ? "border-white/25 border-t-white" : "border-petrol/15 border-t-petrol";
  return <span aria-hidden className={`inline-block shrink-0 animate-spin rounded-full border-2 motion-reduce:animate-none ${ring} ${className}`} />;
}
