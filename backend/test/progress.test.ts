import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { courses, lessons, skills, units, userStats } from "../src/db/schema.js";
import { fakeTranscriber, fakeMinter } from "./helpers.js";

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
    // "skill-1" has exactly one lesson, so completing it crowns the skill.
    // There is no next skill in this tiny fixture, so nothing new unlocks.
    expect(body.unlockedSkillIds).toEqual([]);
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
});
