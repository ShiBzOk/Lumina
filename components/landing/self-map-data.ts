// Written by `pnpm landing:map` from a real parse of this repository. Don't edit by hand.

export const SELF_MAP = {
  "focus": {
    "file": "lib/analyses.ts",
    "width": 1300,
    "height": 344,
    "card": {
      "width": 340,
      "header": 64,
      "row": 40,
      "padding": 10
    },
    "nodes": [
      {
        "id": "app",
        "label": "app",
        "total": 5,
        "x": 0,
        "y": 0,
        "rows": [
          {
            "label": "page.tsx",
            "type": "react",
            "fanIn": 0,
            "fanOut": 5,
            "selected": false,
            "left": null,
            "right": "in"
          }
        ]
      },
      {
        "id": "app/analyses",
        "label": "analyses",
        "total": 2,
        "x": 0,
        "y": 180,
        "rows": [
          {
            "label": "[id]/page.tsx",
            "type": "react",
            "fanIn": 0,
            "fanOut": 6,
            "selected": false,
            "left": null,
            "right": "in"
          },
          {
            "label": "actions.ts",
            "type": "typescript",
            "fanIn": 4,
            "fanOut": 8,
            "selected": false,
            "left": null,
            "right": "in"
          }
        ]
      },
      {
        "id": "lib",
        "label": "lib",
        "total": 7,
        "x": 480,
        "y": 70,
        "rows": [
          {
            "label": "analyses.ts",
            "type": "typescript",
            "fanIn": 3,
            "fanOut": 5,
            "selected": true,
            "left": "in",
            "right": "out"
          },
          {
            "label": "stages.ts",
            "type": "typescript",
            "fanIn": 9,
            "fanOut": 1,
            "selected": false,
            "left": "out",
            "right": null
          },
          {
            "label": "supabase.ts",
            "type": "typescript",
            "fanIn": 3,
            "fanOut": 2,
            "selected": false,
            "left": "out",
            "right": null
          }
        ]
      },
      {
        "id": "lib/map",
        "label": "lib/map",
        "total": 9,
        "x": 960,
        "y": 0,
        "rows": [
          {
            "label": "frameworks.ts",
            "type": "typescript",
            "fanIn": 11,
            "fanOut": 0,
            "selected": false,
            "left": "out",
            "right": null
          }
        ]
      },
      {
        "id": "parser",
        "label": "parser",
        "total": 10,
        "x": 960,
        "y": 180,
        "rows": [
          {
            "label": "io.ts",
            "type": "typescript",
            "fanIn": 5,
            "fanOut": 1,
            "selected": false,
            "left": "out",
            "right": null
          },
          {
            "label": "types.ts",
            "type": "typescript",
            "fanIn": 22,
            "fanOut": 0,
            "selected": false,
            "left": "out",
            "right": null
          }
        ]
      }
    ],
    "edges": [
      {
        "d": "M340,274 C410,274 410,164 480,164",
        "direction": "in"
      },
      {
        "d": "M340,314 C410,314 410,164 480,164",
        "direction": "in"
      },
      {
        "d": "M340,94 C410,94 410,164 480,164",
        "direction": "in"
      },
      {
        "d": "M820,164 C890,164 890,94 960,94",
        "direction": "out"
      },
      {
        "d": "M820,164 C866,164 866,204 820,204",
        "direction": "out"
      },
      {
        "d": "M820,164 C876,164 876,244 820,244",
        "direction": "out"
      },
      {
        "d": "M820,164 C890,164 890,274 960,274",
        "direction": "out"
      },
      {
        "d": "M820,164 C890,164 890,314 960,314",
        "direction": "out"
      }
    ]
  },
  "coverage": {
    "adapter": "nextjs",
    "found": 82,
    "parsed": 82,
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
      "external": 105,
      "excluded": 0,
      "unresolved": 0
    },
    "roles": [
      {
        "role": "component",
        "count": 27
      },
      {
        "role": "page",
        "count": 5
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
