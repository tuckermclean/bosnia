import { describe, it, expect, afterEach } from "vitest";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { maybeAutoSeed } from "../src/auto-seed.js";
import { courses } from "../src/db/schema.js";
import { COURSE_ID } from "../scripts/seed-course.js";

/**
 * Unit tests for the extracted auto-seed helper (see src/auto-seed.ts),
 * exercising it directly against a fresh `createTestDb()` rather than the
 * full boot sequence — `index.ts` only decides *whether* to call this
 * (based on `isLocalDb` + `AUTO_SEED`), so that decision doesn't need its
 * own DB-level test.
 */
describe("maybeAutoSeed", () => {
  let dbHandle: DbHandle | undefined;

  afterEach(async () => {
    await dbHandle?.close();
    dbHandle = undefined;
  });

  it("seeds the real generated course content into a fresh, empty DB", async () => {
    dbHandle = await createTestDb();
    const logs: string[] = [];

    const outcome = await maybeAutoSeed(dbHandle.db, (msg) => logs.push(msg));

    expect(outcome.seeded).toBe(true);
    if (!outcome.seeded) throw new Error("unreachable");
    expect(outcome.result.unitCount).toBeGreaterThan(0);
    expect(outcome.result.skillCount).toBeGreaterThan(0);
    expect(outcome.result.lessonCount).toBeGreaterThan(0);
    expect(outcome.result.exerciseCount).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes("auto-seeded course") && l.includes(COURSE_ID))).toBe(true);

    const seededCourses = await dbHandle.db.select().from(courses);
    expect(seededCourses.map((c) => c.id)).toContain(COURSE_ID);
  });

  it("no-ops when the DB already has course rows", async () => {
    dbHandle = await createTestDb();
    await dbHandle.db.insert(courses).values({ id: "already-here", language: "bs", title: "Existing" });
    const logs: string[] = [];

    const outcome = await maybeAutoSeed(dbHandle.db, (msg) => logs.push(msg));

    expect(outcome).toEqual({ seeded: false, reason: "not-empty" });
    expect(logs).toEqual([]);

    // Untouched: still just the one pre-existing row, not seeded on top of it.
    const rows = await dbHandle.db.select().from(courses);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("already-here");
  });
});
