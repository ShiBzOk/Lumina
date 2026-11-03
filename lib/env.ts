// Checked once at startup. next.config.ts imports this, so a missing value stops
// `next dev` and `next build` immediately instead of surfacing later as an
// anonymous database client or a Clerk error deep inside a render.

const required = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
  "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
] as const;

type EnvKey = (typeof required)[number];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  throw new Error(
    `Missing environment variables in .env.local: ${missing.join(", ")}`,
  );
}

function get(key: EnvKey): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

// Clerk reads its own variables; only what our code passes around is exposed.
export const env = {
  supabaseUrl: get("NEXT_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  // Server only: the pipeline writer. Not NEXT_PUBLIC_, so it never reaches a bundle.
  supabaseSecretKey: get("SUPABASE_SERVICE_ROLE_KEY"),
  openaiKey: get("OPENAI_API_KEY"),
  // Optional on purpose: calls work without it. It is reported in the pane,
  // because a missing key otherwise looks exactly like no traffic.
  tracing: process.env.LANGSMITH_TRACING?.trim() === "true" && Boolean(process.env.LANGSMITH_API_KEY?.trim()),
};
