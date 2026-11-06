// Written by `pnpm landing:map` from a real parse of this repository. Don't edit by hand.

export const SELF_MAP = {
  "coverage": {
    "adapter": "nextjs",
    "found": 85,
    "parsed": 85,
    "skipped": 0,
    "excluded": [
      {
        "reason": "gitignored",
        "count": 6
      },
      {
        "reason": "vcs",
        "count": 1
      },
      {
        "reason": "dependencies",
        "count": 1
      }
    ],
    "edges": 210,
    "imports": {
      "internal": 210,
      "external": 108,
      "excluded": 0,
      "unresolved": 0
    },
    "roles": [
      {
        "role": "component",
        "count": 28
      },
      {
        "role": "page",
        "count": 5
      },
      {
        "role": "fallback",
        "count": 2
      },
      {
        "role": "hook",
        "count": 2
      },
      {
        "role": "action",
        "count": 1
      },
      {
        "role": "layout",
        "count": 1
      },
      {
        "role": "config",
        "count": 1
      },
      {
        "role": "middleware",
        "count": 1
      }
    ]
  }
} as const;
