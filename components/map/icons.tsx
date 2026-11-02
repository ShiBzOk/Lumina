// Stroke icons drawn inline, so the map carries no icon dependency.

const PATHS = {
  arrowLeft: ["m12 19-7-7 7-7", "M19 12H5"],
  folder: ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
  move: ["M12 2v20", "m15 19-3 3-3-3", "m19 9 3 3-3 3", "M2 12h20", "m5 9-3 3 3 3", "m9 5 3-3 3 3"],
  layers: [
    "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
    "m6.08 9.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59",
    "m6.08 14.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59",
  ],
  network: ["M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3", "M12 12V8", "M9 2h6v6H9z", "M2 16h6v6H2z", "M16 16h6v6h-6z"],
  search: ["m21 21-4.34-4.34", "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z"],
  sliders: ["M21 4h-7", "M10 4H3", "M21 12h-9", "M8 12H3", "M21 20h-5", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4"],
  chevronLeft: ["m15 18-6-6 6-6"],
  chevronRight: ["m9 18 6-6-6-6"],
  chevronDown: ["m6 9 6 6 6-6"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  pointer: ["M4.04 4.65a.5.5 0 0 1 .61-.61l16 6.5a.5.5 0 0 1-.06.95l-6.12 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.12a.5.5 0 0 1-.95.06Z"],
  hand: [
    "M18 11V6a2 2 0 0 0-4 0v1",
    "M14 10V4a2 2 0 0 0-4 0v2",
    "M10 10.5V6a2 2 0 0 0-4 0v8",
    "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  ],
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M14 14h7v7h-7z", "M3 14h7v7H3z"],
  map: [
    "M14.1 5.9 9.9 3.8a2 2 0 0 0-1.8 0L3.6 6a1 1 0 0 0-.6.9v12.4a1 1 0 0 0 1.4.9l3.7-1.9a2 2 0 0 1 1.8 0l4.2 2.1a2 2 0 0 0 1.8 0l4.5-2.2a1 1 0 0 0 .6-.9V4.9a1 1 0 0 0-1.4-.9l-3.7 1.9a2 2 0 0 1-1.8 0Z",
    "M15 5.76v15",
    "M9 3.24v15",
  ],
  zoomIn: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z", "M21 21l-4.35-4.35", "M11 8v6", "M8 11h6"],
  zoomOut: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z", "M21 21l-4.35-4.35", "M8 11h6"],
  maximize: ["M15 3h6v6", "m21 3-7 7", "m3 21 7-7", "M9 21H3v-6"],
  minimize: ["m14 10 7-7", "M20 10h-6V4", "m3 21 7-7", "M4 14h6v6"],
  copy: ["M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  check: ["M20 6 9 17l-5-5"],
  branch: ["M6 3v12", "M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M18 9a9 9 0 0 1-9 9"],
  repo: ["M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20", "M9 10h6"],
  arrowUpRight: ["M7 7h10v10", "M7 17 17 7"],
  arrowDownLeft: ["M17 7 7 17", "M17 17H7V7"],
  alert: ["M12 8v4", "M12 16h.01", "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z"],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-3.5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
