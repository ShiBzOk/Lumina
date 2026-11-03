// The spring behind --spring in globals.css, for what CSS can't move: the
// viewport and card positions, which edges have to follow frame by frame.
const RESPONSE = 0.35;
const OMEGA = (2 * Math.PI) / RESPONSE;
/** Under this much of the distance left, it is at rest. */
const REST = 0.001;

/**
 * Calls onFrame with progress from 0 to 1 on each frame, ending on exactly 1.
 * Returns a cancel. Whoever cancels keeps whatever was last drawn, so a
 * gesture that interrupts starts from where things are on screen.
 */
export function spring(onFrame: (progress: number) => void): () => void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = performance.now();
  let id = requestAnimationFrame(function frame(now) {
    const t = Math.max(0, now - start) / 1000;
    const rest = (1 + OMEGA * t) * Math.exp(-OMEGA * t);
    if (reduced || rest < REST) return onFrame(1);
    onFrame(1 - rest);
    id = requestAnimationFrame(frame);
  });
  return () => cancelAnimationFrame(id);
}

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
