import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { applyHeartRegen, computeStreak } from "../src/routes/progress.js";
import { courses, exercises, lessons, skills, units, userSkillProgress, userStats } from "../src/db/schema.js";
import { fakeTranscriber, fakeMinter } from "./helpers.js";

/** Insert `count` throwaway multiple-choice exercises for a lesson, so the
 * server-side "clamp to real exercise count" logic in lesson-complete has
 * something real to clamp against. */
async function seedExercises(db: DbHandle["db"], lessonId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await db.insert(exercises).values({
      id: `${lessonId}-ex-${i}`,
      lessonId,
      orderIndex: i,
      type: "multiple_choice",
      payload: { prompt: `prompt ${i}`, answer: "a", choices: ["a", "b"] },
    });
  }
}

describe("progress", () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeEach(async () => {
    dbHandle = await createTestDb();
    app = buildApp({ db: dbHandle.db, transcriber: fakeTranscriber(""), minter: fakeMinter() });
    await app.ready();

    const { db } = dbHandle;
    await db.insert(courses).values({ id: "course-1", language: "bs", title: "Test course" });
    await db
      .insert(units)
      .values({ id: "unit-1", courseId: "course-1", level: "A1", orderIndex: 0, title: "U", titleEn: "U" });
    await db
      .insert(skills)
      .values({ id: "skill-1", unitId: "unit-1", orderIndex: 0, title: "S", titleEn: "S" });
    await db.insert(lessons).values({ id: "lesson-1", skillId: "skill-1", orderIndex: 0, title: "L" });
    await seedExercises(db, "lesson-1", 5);

    // A second skill/lesson in the same unit, locked by default (only the
    // first skill of the first unit is unlocked without a progress row) — used
    // by the unlock-enforcement / crown-chain / pass-gating tests below.
    await db
      .insert(skills)
      .values({ id: "skill-2", unitId: "unit-1", orderIndex: 1, title: "S2", titleEn: "S2" });
    await db.insert(lessons).values({ id: "lesson-2", skillId: "skill-2", orderIndex: 0, title: "L2" });
    await seedExercises(db, "lesson-2", 5);
  });

  afterEach(async () => {
    await app.close();
    await dbHandle.close();
  });

  async function registerUser() {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "learner@example.com", password: "password1" },
    });
    return res.json() as { user: { id: string; email: string }; accessToken: string };
  }

  function authed(accessToken: string, overrides: Record<string, unknown> = {}) {
    return { headers: { authorization: `Bearer ${accessToken}` }, ...overrides };
  }

  it("updates xp/streak/hearts and persists a lesson attempt", async () => {
    const { accessToken } = await registerUser();

    const res = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lessonId: "lesson-1", correctCount: 4, total: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.xp).toBe(40); // 4 correct * 10 xp
    expect(body.stats.hearts).toBe(4); // 5 hearts - 1 wrong answer
    expect(body.stats.streak).toBe(1); // first-ever activity

    const rows = await dbHandle.db.select().from(userStats);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.xp).toBe(40);
    expect(rows[0]?.hearts).toBe(4);
    expect(rows[0]?.streak).toBe(1);
    expect(rows[0]?.lastActive).not.toBeNull();
  });

  it("bumps the streak by one on a second day and unlocks/crowns the completed skill", async () => {
    const { accessToken, user } = await registerUser();

    // Simulate "yesterday" activity by backdating lastActive.
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await dbHandle.db
      .update(userStats)
      .set({ streak: 3, lastActive: yesterday })
      .where(eq(userStats.userId, user.id));

    const res = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lessonId: "lesson-1", correctCount: 5, total: 5 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.streak).toBe(4);
    // "skill-1" is fully passed, which crowns it and unlocks "skill-2".
    expect(body.unlockedSkillIds).toEqual(["skill-2"]);
  });

  it("regenerates hearts over time on GET /progress and persists the regen", async () => {
    const { accessToken, user } = await registerUser();

    // Deplete hearts and backdate heartsUpdatedAt by 65 minutes (2 regen ticks).
    const past = new Date(Date.now() - 65 * 60 * 1000);
    await dbHandle.db
      .update(userStats)
      .set({ hearts: 1, heartsUpdatedAt: past })
      .where(eq(userStats.userId, user.id));

    const res = await app.inject({
      method: "GET",
      url: "/api/progress",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.hearts).toBe(3);

    const rows = await dbHandle.db.select().from(userStats).where(eq(userStats.userId, user.id));
    expect(rows[0]?.hearts).toBe(3);
  });

  it("clamps correctCount/total to the lesson's real exercise count", async () => {
    const { accessToken } = await registerUser();

    // lesson-1 only has 5 real exercises; a crafted request claiming 500/500
    // must not be able to inflate XP beyond what 5 exercises could award.
    const res = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { lessonId: "lesson-1", correctCount: 500, total: 500 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.stats.xp).toBe(50); // clamped to 5 correct * 10 xp, not 5000
  });

  it("rejects lesson-complete for a locked skill's lesson with 403", async () => {
    const { accessToken } = await registerUser();

    // skill-2 is not the first skill of the first unit and has no progress
    // row yet, so it must still be locked.
    const res = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      ...authed(accessToken, { payload: { lessonId: "lesson-2", correctCount: 5, total: 5 } }),
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects GET /api/lessons/:id for a locked skill's lesson with 403", async () => {
    const { accessToken } = await registerUser();

    const res = await app.inject({ method: "GET", url: "/api/lessons/lesson-2", ...authed(accessToken) });
    expect(res.statusCode).toBe(403);
  });

  it("allows GET /api/lessons/:id for the first skill's lesson without any progress row", async () => {
    const { accessToken } = await registerUser();

    const res = await app.inject({ method: "GET", url: "/api/lessons/lesson-1", ...authed(accessToken) });
    expect(res.statusCode).toBe(200);
  });

  it("multi-skill crown->unlock chain: passing skill-1's lesson unlocks skill-2, which then accepts completion", async () => {
    const { accessToken } = await registerUser();

    const complete1 = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      ...authed(accessToken, { payload: { lessonId: "lesson-1", correctCount: 5, total: 5 } }),
    });
    expect(complete1.statusCode).toBe(200);
    expect(complete1.json().unlockedSkillIds).toEqual(["skill-2"]);

    const progressRows = await dbHandle.db.select().from(userSkillProgress);
    const skill1Progress = progressRows.find((p) => p.skillId === "skill-1");
    const skill2Progress = progressRows.find((p) => p.skillId === "skill-2");
    expect(skill1Progress?.crownLevel).toBe(1);
    expect(skill2Progress?.unlocked).toBe(true);

    // Now that skill-2 is unlocked, its lesson is reachable and completable.
    const lessonRes = await app.inject({ method: "GET", url: "/api/lessons/lesson-2", ...authed(accessToken) });
    expect(lessonRes.statusCode).toBe(200);

    const complete2 = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      ...authed(accessToken, { payload: { lessonId: "lesson-2", correctCount: 5, total: 5 } }),
    });
    expect(complete2.statusCode).toBe(200);
  });

  it("a failing attempt (below the pass threshold) does NOT crown the skill or unlock the next one", async () => {
    const { accessToken } = await registerUser();

    // 0/5 is well under PASS_RATIO (0.6) — the attempt is recorded, but must
    // not count toward skill completion.
    const res = await app.inject({
      method: "POST",
      url: "/api/progress/lesson-complete",
      ...authed(accessToken, { payload: { lessonId: "lesson-1", correctCount: 0, total: 5 } }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().unlockedSkillIds).toEqual([]);

    const progressRows = await dbHandle.db.select().from(userSkillProgress);
    expect(progressRows.find((p) => p.skillId === "skill-1")).toBeUndefined();
    expect(progressRows.find((p) => p.skillId === "skill-2")).toBeUndefined();

    // skill-2 must still be locked.
    const lessonRes = await app.inject({ method: "GET", url: "/api/lessons/lesson-2", ...authed(accessToken) });
    expect(lessonRes.statusCode).toBe(403);
  });
});

describe("applyHeartRegen", () => {
  it("never regenerates past the max, even with a huge elapsed time", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const muchLater = new Date("2026-06-01T00:00:00Z"); // months later
    const result = applyHeartRegen(2, start, muchLater);
    expect(result.hearts).toBe(5);
  });

  it("is a no-op once hearts are already full", () => {
    const now = new Date();
    const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const result = applyHeartRegen(5, anHourAgo, now);
    expect(result.hearts).toBe(5);
    expect(result.heartsUpdatedAt).toBe(anHourAgo);
  });
});

describe("computeStreak", () => {
  it("resets to 1 after a gap of more than one day", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const twoDaysAgo = new Date("2026-01-08T12:00:00Z");
    expect(computeStreak(twoDaysAgo, now, 7)).toBe(1);
  });

  it("bumps by one for activity exactly one calendar day earlier", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const yesterday = new Date("2026-01-09T23:00:00Z");
    expect(computeStreak(yesterday, now, 7)).toBe(8);
  });

  it("starts at 1 when there is no prior activity", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(computeStreak(null, now, 0)).toBe(1);
  });
});
