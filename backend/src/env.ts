import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load .env from the repo root and the backend package (root first, package overrides).
loadDotenv({ path: new URL("../../.env", import.meta.url).pathname });
loadDotenv({ path: new URL("../.env", import.meta.url).pathname });

const schema = z.object({
  // Empty DATABASE_URL => local/test mode using in-process PGlite.
  DATABASE_URL: z.string().optional().default(""),
  // Optional directory for a file-backed PGlite database (local/manual E2E only).
  // Unset => in-memory PGlite, same as tests. Lets `seed` and `dev` share one DB
  // on disk across separate process runs.
  PGLITE_PATH: z.string().optional(),
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
