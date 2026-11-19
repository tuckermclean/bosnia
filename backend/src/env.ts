import { z } from "zod";

// Load .env from the repo root and the backend package (root first, package overrides).
// process.loadEnvFile throws if the file doesn't exist (normal in tests/CI), so each
// load is best-effort.
function loadEnvFileIfPresent(path: string): void {
  try {
    process.loadEnvFile(path);
  } catch {
    // Missing .env is expected outside of local dev — ignore.
  }
}

loadEnvFileIfPresent(new URL("../../.env", import.meta.url).pathname);
loadEnvFileIfPresent(new URL("../.env", import.meta.url).pathname);

const schema = z.object({
  // Empty DATABASE_URL => local/test mode using in-process PGlite.
  DATABASE_URL: z.string().optional().default(""),
  // Optional directory for a file-backed PGlite database (local/manual E2E only).
  // Unset => in-memory PGlite, same as tests. Lets `seed` and `dev` share one DB
  // on disk across separate process runs.
  PGLITE_PATH: z.string().optional(),
  // Controls startup auto-seeding of course content (see src/auto-seed.ts).
  // Unset => auto-seed only when local (no DATABASE_URL) and the DB is
  // empty. "false" disables it even locally; "true" forces it even against
  // a configured DATABASE_URL.
  AUTO_SEED: z.enum(["true", "false"]).optional(),
  JWT_ACCESS_SECRET: z.string().min(1).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(1).default("dev-refresh-secret-change-me"),
  PORT: z.coerce.number().default(3000),

  GROQ_API_KEY: z.string().optional().default(""),
  AZURE_SPEECH_KEY: z.string().optional().default(""),
  AZURE_SPEECH_REGION: z.string().optional().default(""),

  LIVEKIT_URL: z.string().optional().default(""),
  LIVEKIT_API_KEY: z.string().optional().default(""),
  LIVEKIT_API_SECRET: z.string().optional().default(""),
});

export const env = schema.parse(process.env);

/** True when no external Postgres is configured — use PGlite locally and in tests. */
export const isLocalDb = env.DATABASE_URL.trim().length === 0;

/** Minimum length of a JWT secret in non-local mode. */
export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Boot guard: refuse to start against a real database (DATABASE_URL set) with
 * a JWT secret that is unset, starts with "dev-" (the world-known defaults),
 * contains "REPLACE_WITH" (an unedited template placeholder) or is shorter
 * than MIN_JWT_SECRET_LENGTH (32) characters. Local/PGlite dev and the test
 * suite never set DATABASE_URL, so the `dev-*` defaults keep working there
 * unmodified. The error names each refused variable and why, never its value.
 */
export function assertProductionSecretsAreSafe(): void {
  if (isLocalDb) return;

  const reasons = (secret: string): string[] => {
    const out: string[] = [];
    if (!secret) out.push("unset");
    if (secret.startsWith("dev-")) out.push('starts with "dev-"');
    if (secret.includes("REPLACE_WITH")) out.push('contains "REPLACE_WITH"');
    if (secret && secret.length < MIN_JWT_SECRET_LENGTH) {
      out.push(`shorter than ${MIN_JWT_SECRET_LENGTH} characters`);
    }
    return out;
  };
  const problems: string[] = [];
  for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
    const r = reasons(env[name]);
    if (r.length > 0) problems.push(`${name} (${r.join(", ")})`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to boot: DATABASE_URL is set (non-local mode) but ${problems.join("; ")}. ` +
        `Set real, random secrets of at least ${MIN_JWT_SECRET_LENGTH} characters ` +
        `(e.g. \`openssl rand -base64 48\`) before deploying.`,
    );
  }
}
