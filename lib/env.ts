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
};
