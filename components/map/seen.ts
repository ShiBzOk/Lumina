// One-time guidance, remembered per person in this browser.

export const tourKey = (user: string) => `lumina.tour-seen:${user}`;
export const compareHintKey = (user: string) => `lumina.compare-hint-seen:${user}`;

// Storage that can't be read counts as seen: guidance on every open is worse than none.
export function hasSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return true;
  }
}

export function markSeen(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Nothing more to do: the next open reads the same failure and stays quiet.
  }
}
