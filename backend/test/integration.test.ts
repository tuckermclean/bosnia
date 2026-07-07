import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { tutorSessions, pronunciationAttempts } from "../src/db/schema.js";
import { processPronunciation } from "../src/routes/pronunciation.js";
import { scorePronunciation } from "../src/services/scoring.js";
import { seedCourse, COURSE_ID, type RawCourse, type AudioManifest } from "../scripts/seed-course.js";
import { fakeTranscriber, fakeMinter } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COURSE_JSON_PATH = path.resolve(__dirname, "../../content/generated/course.json");
const AUDIO_MANIFEST_PATH = path.resolve(__dirname, "../../content/audio-out/manifest.json");

/**
 * End-to-end integration test over the REAL generated course content (now
 * spanning A1->B2) — no hand-inserted rows. Proves the seam that the
 * per-route tests (which all seed tiny hand-built fixtures) never exercise:
 * `content/generated/course.json` (as actually produced by the `content`
 * package) loads through `seedCourse()` and then serves correctly through
 * the full HTTP API, from registration through lesson-complete, tutor
 * session, and pronunciation scoring.
 *
 * The top-level seed counts (units/skills/lessons/exercises) are derived
 * from the same course.json rather than hardcoded, so the test doesn't need
 * updating every time the curriculum grows. The specific A1 assertions below
 * (course `bs-a1-b2`, unit `a1-u1`, skill `a1-u1-s1`, lesson `a1-u1-s1-l1`)
 * stay hardcoded on purpose: that content is unchanged and `a1-u1` is still
 * unit order 1, i.e. still the first unit served.
 */
describe("end-to-end: real seeded content through the API", () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let accessToken: string;
  // Expected totals, derived from the very same course.json the seed reads
  // below rather than hardcoded — so this test keeps working as the
  // curriculum grows (e.g. A1-only -> A1->B2) instead of asserting stale
  // magic numbers that drift out from under it.
  let expectedUnitCount: number;
  let expectedSkillCount: number;
  let expectedLessonCount: number;
  let expectedExerciseCount: number;

  beforeAll(async () => {
    const course = JSON.parse(await readFile(COURSE_JSON_PATH, "utf8")) as RawCourse;
    const manifest = JSON.parse(await readFile(AUDIO_MANIFEST_PATH, "utf8")) as AudioManifest;

    expectedUnitCount = course.units.length;
    expectedSkillCount = course.units.reduce((sum, unit) => sum + unit.skills.length, 0);
    expectedLessonCount = course.units.reduce(
      (sum, unit) => sum + unit.skills.reduce((s, skill) => s + skill.lessons.length, 0),
      0,
    );
    expectedExerciseCount = course.units.reduce(
      (sum, unit) =>
        sum +
        unit.skills.reduce(
          (s, skill) => s + skill.lessons.reduce((l, lesson) => l + lesson.exercises.length, 0),
          0,
        ),
      0,
    );

    dbHandle = await createTestDb();
    const result = await seedCourse(dbHandle.db, course, manifest);
    // Sanity on the seed itself, ahead of the API-level assertions below.
    expect(result.unitCount).toBe(expectedUnitCount);
    expect(result.skillCount).toBe(expectedSkillCount);
    expect(result.lessonCount).toBe(expectedLessonCount);
    expect(result.exerciseCount).toBe(expectedExerciseCount);

    app = buildApp({
      db: dbHandle.db,
      transcriber: fakeTranscriber("dobar dan"),
      minter: fakeMinter(),
    });
    await app.ready();

    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "learner@example.com", password: "password1" },
    });
    expect(register.statusCode).toBe(200);
    accessToken = register.json().accessToken;
    expect(accessToken).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
    await dbHandle.close();
  });

  function authed(overrides: Record<string, unknown> = {}) {
    return { headers: { authorization: `Bearer ${accessToken}` }, ...overrides };
  }

  it("GET /api/courses serves the real seeded A1->B2 course with the first skill of the first unit unlocked", async () => {
    const res = await app.inject({ method: "GET", url: "/api/courses", ...authed() });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.courses).toHaveLength(1);
    const course = body.courses[0];
    expect(course.id).toBe(COURSE_ID);
    // Curriculum now spans A1->B2 (multiple units), not just a single A1
    // unit — assert against the real count from course.json rather than
    // assuming exactly one unit exists.
    expect(course.units).toHaveLength(expectedUnitCount);

    // The A1 content itself is unchanged and still ordered first, so it's
    // still the first unit served.
    const unit = course.units[0];
    expect(unit.id).toBe("a1-u1");
    expect(unit.skills).toHaveLength(5);

    const [firstSkill, ...restSkills] = unit.skills;
    expect(firstSkill.id).toBe("a1-u1-s1");
    expect(firstSkill.unlocked).toBe(true);
    // Nothing has been completed yet, so no other skill should be unlocked.
    for (const skill of restSkills) {
      expect(skill.unlocked).toBe(false);
    }
    expect(firstSkill.lessons.length).toBeGreaterThan(0);
  });

  it("GET /api/lessons/:id returns the first lesson with populated exercise payloads", async () => {
    const courses = (await app.inject({ method: "GET", url: "/api/courses", ...authed() })).json();
    const firstSkill = courses.courses[0].units[0].skills[0];
    const firstLessonId = firstSkill.lessons[0].id;
    expect(firstLessonId).toBe("a1-u1-s1-l1");

    const res = await app.inject({ method: "GET", url: `/api/lessons/${firstLessonId}`, ...authed() });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.lesson.id).toBe(firstLessonId);
    expect(body.lesson.skillId).toBe(firstSkill.id);
    expect(body.exercises).toHaveLength(6);
    for (const exercise of body.exercises) {
      expect(exercise.payload).toBeTruthy();
      expect(typeof exercise.payload.prompt).toBe("string");
      expect(exercise.payload.prompt.length).toBeGreaterThan(0);
    }
    // At least the multiple_choice exercises carry an answer + choices straight
    // from the content JSON.
    const multipleChoice = body.exercises.find((e: { type: string }) => e.type === "multiple_choice");
    expect(multipleChoice.payload.answer).toBeTruthy();
    expect(multipleChoice.payload.choices?.length).toBeGreaterThan(0);
  });

  it("POST /api/progress/lesson-complete raises xp for the real first lesson", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      ...authed({ payload: { lessonId: "a1-u1-s1-l1", correctCount: 5, total: 6 } }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.xp).toBe(50); // 5 correct * 10 xp
    expect(body.stats).toHaveProperty("hearts");
    expect(body.stats).toHaveProperty("streak");
    expect(Array.isArray(body.unlockedSkillIds)).toBe(true);
  });

  it("POST /api/tutor/session mints a token and records a real tutor_sessions row", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/tutor/session",
      ...authed({ payload: {} }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeTruthy();
    expect(body.roomName).toMatch(/^tutor-/);

    const rows = await dbHandle.db.select().from(tutorSessions).where(eq(tutorSessions.roomName, body.roomName));
    expect(rows).toHaveLength(1);
  });

  it("processPronunciation scores a real 'speak' exercise's targetPhrase and persists the attempt", async () => {
    const lessonRes = await app.inject({ method: "GET", url: "/api/lessons/a1-u1-s1-l1", ...authed() });
    const lessonBody = lessonRes.json();
    const speakExercise = lessonBody.exercises.find((e: { type: string }) => e.type === "speak");
    expect(speakExercise).toBeTruthy();
    const targetPhrase: string = speakExercise.payload.targetPhrase;
    expect(targetPhrase).toBeTruthy();

    const deps = { db: dbHandle.db, transcriber: fakeTranscriber("dobar dan"), minter: fakeMinter() };
    const result = await processPronunciation(deps, {
      userId: (await app.inject({ method: "GET", url: "/api/auth/me", ...authed() })).json().user.id,
      targetPhrase,
      exerciseId: speakExercise.id,
      audio: Buffer.from("fake-audio-bytes"),
      filename: "sample.webm",
    });

    const expected = scorePronunciation(targetPhrase, "dobar dan");
    expect(result.score).toBe(expected.score);
    expect(typeof result.score).toBe("number");

    const rows = await dbHandle.db
      .select()
      .from(pronunciationAttempts)
      .where(eq(pronunciationAttempts.exerciseId, speakExercise.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetPhrase).toBe(targetPhrase);
    expect(rows[0]?.score).toBe(expected.score);
  });
});
