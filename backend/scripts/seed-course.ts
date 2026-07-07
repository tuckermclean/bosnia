#!/usr/bin/env tsx
/**
 * Seed the DB with the canonical course content produced by the `content` package.
 *
 * Reads:
 *   ../content/generated/course.json      (required — logs and exits cleanly if absent)
 *   ../content/audio-out/manifest.json    (optional — audioHash -> {url,text,voice})
 *
 * The actual DB-writing logic lives in the exported `seedCourse()` function so it
 * can be reused directly (e.g. from integration tests) without shelling out to this
 * script or re-reading files from disk. This file is just the CLI entrypoint: read
 * JSON off disk, open a DB handle, call `seedCourse`, report, close.
 *
 * Idempotent: every row is upserted by id, so reruns after content regeneration
 * (or partial-content dev iterations) are safe.
 *
 * Run with: npx tsx scripts/seed-course.ts   (or `npm run seed --workspace @bosanski/backend`)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDbHandle } from "../src/db/client.js";
import type { Db } from "../src/db/client.js";
import { courses, exercises, lessons, skills, units } from "../src/db/schema.js";
import type { ExercisePayload, ExerciseType, ReviewStatus } from "../src/db/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In the monorepo checkout (this file run via `tsx` from `backend/scripts/`),
// `content/` is a sibling of `backend/`, so the default two-levels-up resolution
// holds. That relative distance changes once this file is compiled to
// `backend/dist/scripts/seed-course.js` and run from a container image (see
// `backend/Dockerfile`), where `content/generated` + `content/audio-out` are
// baked in at a fixed, deployment-chosen path instead. CONTENT_DIR lets the
// image (or any other non-standard layout) override the base directory
// without touching this default for local dev/tests.
const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.resolve(__dirname, "../../content");
const COURSE_JSON_PATH = path.join(CONTENT_DIR, "generated/course.json");
const AUDIO_MANIFEST_PATH = path.join(CONTENT_DIR, "audio-out/manifest.json");

// The content package's course.json has no top-level id/title (just `language`
// + `units`) — this backend assigns the single canonical course its identity.
export const COURSE_ID = "bs-a1-b2";
export const COURSE_TITLE = "Bosnian A1–B2";

export interface RawExercise {
  id: string;
  type: ExerciseType;
  prompt: string;
  promptEn?: string;
  translationDirection?: "bs->en" | "en->bs";
  answer?: string;
  choices?: string[];
  pairs?: { bs: string; en: string }[];
  targetPhrase?: string;
  audioHash?: string;
}
export interface RawLesson {
  id: string;
  order: number;
  title: string;
  exercises: RawExercise[];
}
export interface RawSkill {
  id: string;
  order: number;
  title: string;
  titleEn: string;
  grammarTip: string;
  reviewStatus: ReviewStatus;
  lessons: RawLesson[];
}
export interface RawUnit {
  id: string;
  level: string;
  order: number;
  title: string;
  titleEn: string;
  theme: string;
  skills: RawSkill[];
}
export interface RawCourse {
  language: string;
  units: RawUnit[];
}

export interface AudioManifestEntry {
  url: string;
  text: string;
  voice: string;
}
export type AudioManifest = Record<string, AudioManifestEntry>;

export interface SeedCourseResult {
  unitCount: number;
  skillCount: number;
  lessonCount: number;
  exerciseCount: number;
  audioHits: number;
  audioMisses: number;
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/**
 * Upsert a parsed `course.json` (plus optional audio manifest) into the DB. Pure
 * DB-writing logic — no file I/O, no DB-handle lifecycle — so callers (the CLI
 * below, or tests that want to seed real generated content into a `createTestDb()`)
 * own how the `db` and source JSON are obtained. Idempotent via onConflictDoUpdate.
 */
export async function seedCourse(
  db: Db,
  course: RawCourse,
  manifest: AudioManifest = {},
): Promise<SeedCourseResult> {
  await db
    .insert(courses)
    .values({ id: COURSE_ID, language: course.language, title: COURSE_TITLE })
    .onConflictDoUpdate({
      target: courses.id,
      set: { language: course.language, title: COURSE_TITLE },
    });

  let unitCount = 0;
  let skillCount = 0;
  let lessonCount = 0;
  let exerciseCount = 0;
  let audioHits = 0;
  let audioMisses = 0;

  for (const unit of course.units) {
    await db
      .insert(units)
      .values({
        id: unit.id,
        courseId: COURSE_ID,
        level: unit.level,
        orderIndex: unit.order,
        title: unit.title,
        titleEn: unit.titleEn,
        theme: unit.theme,
      })
      .onConflictDoUpdate({
        target: units.id,
        set: {
          courseId: COURSE_ID,
          level: unit.level,
          orderIndex: unit.order,
          title: unit.title,
          titleEn: unit.titleEn,
          theme: unit.theme,
        },
      });
    unitCount++;

    for (const skill of unit.skills) {
      await db
        .insert(skills)
        .values({
          id: skill.id,
          unitId: unit.id,
          orderIndex: skill.order,
          title: skill.title,
          titleEn: skill.titleEn,
          grammarTip: skill.grammarTip,
          reviewStatus: skill.reviewStatus,
        })
        .onConflictDoUpdate({
          target: skills.id,
          set: {
            unitId: unit.id,
            orderIndex: skill.order,
            title: skill.title,
            titleEn: skill.titleEn,
            grammarTip: skill.grammarTip,
            reviewStatus: skill.reviewStatus,
          },
        });
      skillCount++;

      for (const lesson of skill.lessons) {
        await db
          .insert(lessons)
          .values({ id: lesson.id, skillId: skill.id, orderIndex: lesson.order, title: lesson.title })
          .onConflictDoUpdate({
            target: lessons.id,
            set: { skillId: skill.id, orderIndex: lesson.order, title: lesson.title },
          });
        lessonCount++;

        for (const [idx, ex] of lesson.exercises.entries()) {
          let audioUrl: string | undefined;
          if (ex.audioHash) {
            const entry = manifest[ex.audioHash];
            if (entry) {
              audioUrl = entry.url;
              audioHits++;
            } else {
              audioMisses++;
            }
          }

          const payload: ExercisePayload = {
            prompt: ex.prompt,
            promptEn: ex.promptEn,
            answer: ex.answer,
            choices: ex.choices,
            pairs: ex.pairs,
            targetPhrase: ex.targetPhrase,
            audioUrl,
            translationDirection: ex.translationDirection,
          };

          await db
            .insert(exercises)
            .values({
              id: ex.id,
              lessonId: lesson.id,
              orderIndex: idx,
              type: ex.type,
              payload,
              reviewStatus: skill.reviewStatus,
            })
            .onConflictDoUpdate({
              target: exercises.id,
              set: {
                lessonId: lesson.id,
                orderIndex: idx,
                type: ex.type,
                payload,
                reviewStatus: skill.reviewStatus,
              },
            });
          exerciseCount++;
        }
      }
    }
  }

  return { unitCount, skillCount, lessonCount, exerciseCount, audioHits, audioMisses };
}

async function main(): Promise<void> {
  const course = await readJson<RawCourse>(COURSE_JSON_PATH);
  if (!course) {
    console.log(
      `[seed-course] No course JSON found at ${COURSE_JSON_PATH} — nothing to seed. ` +
        `Run the content pipeline (\`npm run --workspace content ...\`) first.`,
    );
    return;
  }

  const manifest = (await readJson<AudioManifest>(AUDIO_MANIFEST_PATH)) ?? {};
  if (Object.keys(manifest).length === 0) {
    console.log(
      `[seed-course] No audio manifest found at ${AUDIO_MANIFEST_PATH} — seeding without audioUrl. ` +
        `Re-run after audio synthesis to backfill.`,
    );
  }

  const { db, initSchema, close } = createDbHandle();
  await initSchema();

  const result = await seedCourse(db, course, manifest);

  console.log(
    `[seed-course] Seeded course "${COURSE_ID}": ${result.unitCount} units, ${result.skillCount} skills, ` +
      `${result.lessonCount} lessons, ${result.exerciseCount} exercises ` +
      `(audio: ${result.audioHits} matched, ${result.audioMisses} missing from manifest).`,
  );

  await close();
}

main().catch((err) => {
  console.error("[seed-course] Failed:", err);
  process.exit(1);
});
