/**
 * Local-dev convenience: auto-seed the canonical course content on boot when
 * the running DB is empty.
 *
 * Root cause this fixes: with the default in-memory PGlite, `npm run dev`
 * and `npm run seed` are separate processes with separate, empty DBs — so a
 * freshly started dev server serves `{"courses":[]}` from `GET /api/courses`
 * even though `npm run seed` "succeeded" (in a different process's DB). The
 * app's Home screen then has nothing to render. Auto-seeding on boot when
 * local + empty removes that footgun without changing production behavior,
 * where seeding stays a deliberate, explicit Job (see `scripts/seed-course.ts`).
 *
 * Deliberately does NOT decide *whether* to run (that depends on `isLocalDb`
 * + `AUTO_SEED` from `src/env.ts`, which `index.ts` already reads) — this
 * module just does the "DB empty? then seed" check plus the actual seeding,
 * reusing `seedCourse()` so ingest logic lives in exactly one place.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./db/client.js";
import { courses } from "./db/schema.js";
import { seedCourse, COURSE_ID } from "../scripts/seed-course.js";
import type { AudioManifest, RawCourse, SeedCourseResult } from "../scripts/seed-course.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same default resolution as scripts/seed-course.ts (both `src/` and
// `scripts/` are one level under `backend/`, so `../../content` lands on the
// same directory either way). CONTENT_DIR lets a container image override it.
const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.resolve(__dirname, "../../content");
const COURSE_JSON_PATH = path.join(CONTENT_DIR, "generated/course.json");
const AUDIO_MANIFEST_PATH = path.join(CONTENT_DIR, "audio-out/manifest.json");

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export type AutoSeedOutcome =
  | { seeded: true; result: SeedCourseResult }
  | { seeded: false; reason: "not-empty" | "no-course-json" | "error" };

/**
 * If `db`'s `courses` table is empty, load `content/generated/course.json`
 * (+ optional `content/audio-out/manifest.json`) and seed it via
 * `seedCourse()`. No-ops (does not touch the DB) if `courses` already has
 * rows. Never throws — any failure (missing/unreadable/malformed content,
 * DB error) is logged via `log` and reported back as `{ seeded: false }` so
 * the caller can boot the server regardless.
 */
export async function maybeAutoSeed(db: Db, log: (msg: string) => void = console.log): Promise<AutoSeedOutcome> {
  try {
    const existing = await db.select().from(courses).limit(1);
    if (existing.length > 0) {
      return { seeded: false, reason: "not-empty" };
    }

    const course = await readJson<RawCourse>(COURSE_JSON_PATH);
    if (!course) {
      log(
        `[startup] local DB empty but no course JSON found at ${COURSE_JSON_PATH} — ` +
          `skipping auto-seed. Run \`npm run seed -w @bosanski/backend\` (after generating ` +
          `content) or restart once content exists.`,
      );
      return { seeded: false, reason: "no-course-json" };
    }

    const manifest = (await readJson<AudioManifest>(AUDIO_MANIFEST_PATH)) ?? {};
    const result = await seedCourse(db, course, manifest);

    log(
      `[startup] local DB empty — auto-seeded course ${COURSE_ID} ` +
        `(${result.unitCount} units / ${result.skillCount} skills)`,
    );
    return { seeded: true, result };
  } catch (err) {
    log(`[startup] auto-seed failed, continuing to boot without seeded content: ${(err as Error).message ?? err}`);
    return { seeded: false, reason: "error" };
  }
}
