import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { exercises, lessons, lessonAttempts, userSkillProgress, userStats } from "../db/schema.js";
import { HttpError, requireAuth, userIdOf } from "../http.js";
import { findNextSkillId, isSkillUnlocked } from "../services/progression.js";

const MAX_HEARTS = 5;
const HEART_REGEN_INTERVAL_MS = 30 * 60 * 1000; // 1 heart per 30 minutes
const MAX_CROWN_LEVEL = 5;
/** A lesson only counts toward crown/unlock progression once scored >= 60% —
 * closes the "0/10, out of hearts" exploit where any attempt (even a total
 * failure) used to unlock the next skill. */
const PASS_RATIO = 0.6;

/** Regenerate hearts based on elapsed time since `heartsUpdatedAt`, preserving the
 * remainder of a not-yet-complete interval so regen timing stays accurate across
 * repeated calls. Returns the same values (no-op) once hearts are already full. */
export function applyHeartRegen(
  hearts: number,
  heartsUpdatedAt: Date,
  now: Date,
): { hearts: number; heartsUpdatedAt: Date } {
  if (hearts >= MAX_HEARTS) return { hearts, heartsUpdatedAt };
  const elapsedMs = now.getTime() - heartsUpdatedAt.getTime();
  const regenCount = Math.floor(elapsedMs / HEART_REGEN_INTERVAL_MS);
  if (regenCount <= 0) return { hearts, heartsUpdatedAt };

  const newHearts = Math.min(MAX_HEARTS, hearts + regenCount);
  if (newHearts >= MAX_HEARTS) return { hearts: newHearts, heartsUpdatedAt: now };

  const consumedMs = regenCount * HEART_REGEN_INTERVAL_MS;
  return { hearts: newHearts, heartsUpdatedAt: new Date(heartsUpdatedAt.getTime() + consumedMs) };
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Daily streak: same calendar day (UTC) leaves it unchanged, yesterday bumps it
 * by one, anything older (or no prior activity) resets it to 1. */
export function computeStreak(lastActive: Date | null | undefined, now: Date, currentStreak: number): number {
  if (!lastActive) return 1;
  if (isSameCalendarDay(lastActive, now)) return currentStreak;
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (isSameCalendarDay(lastActive, yesterday)) return currentStreak + 1;
  return 1;
}

const lessonCompleteBody = z.object({
  lessonId: z.string().min(1),
  correctCount: z.number().int().min(0),
  total: z.number().int().min(0),
});

export function progressRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get("/api/progress", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);

    const statsRows = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
    const stats = statsRows[0];
    if (!stats) throw new HttpError(404, "User stats not found");

    const now = new Date();
    const regen = applyHeartRegen(stats.hearts, stats.heartsUpdatedAt ?? now, now);
    let finalStats = stats;
    if (regen.hearts !== stats.hearts) {
      await db
        .update(userStats)
        .set({ hearts: regen.hearts, heartsUpdatedAt: regen.heartsUpdatedAt })
        .where(eq(userStats.userId, userId));
      finalStats = { ...stats, hearts: regen.hearts, heartsUpdatedAt: regen.heartsUpdatedAt };
    }

    const skillProgress = await db.select().from(userSkillProgress).where(eq(userSkillProgress.userId, userId));
    return { stats: finalStats, skillProgress };
  });

  app.post("/api/progress/lesson-complete", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);
    const { lessonId, correctCount: rawCorrectCount, total: rawTotal } = lessonCompleteBody.parse(request.body);

    const lessonRows = await db.select().from(lessons).where(eq(lessons.id, lessonId)).limit(1);
    const lesson = lessonRows[0];
    if (!lesson) throw new HttpError(404, "Lesson not found");

    // Server-side unlock enforcement: mirror the check in GET /api/lessons/:id
    // so a locked skill can't be "completed" directly against the API either.
    if (!(await isSkillUnlocked(db, userId, lesson.skillId))) {
      throw new HttpError(403, "Skill is locked");
    }

    const statsRows = await db.select().from(userStats).where(eq(userStats.userId, userId)).limit(1);
    const stats = statsRows[0];
    if (!stats) throw new HttpError(404, "User stats not found");

    // `correctCount`/`total` are client-supplied — clamp them to the lesson's
    // real exercise count server-side before any XP/heart math, so a crafted
    // request can't inflate XP beyond what the lesson could actually award.
    const exerciseRows = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.lessonId, lessonId));
    const realTotal = exerciseRows.length;
    const total = Math.min(rawTotal, realTotal);
    const correctCount = Math.min(Math.max(0, rawCorrectCount), total);

    const now = new Date();
    const regen = applyHeartRegen(stats.hearts, stats.heartsUpdatedAt ?? now, now);
    const wrongCount = Math.max(0, total - correctCount);
    const newHearts = Math.max(0, regen.hearts - wrongCount);
    const newXp = stats.xp + correctCount * 10;
    const newStreak = computeStreak(stats.lastActive, now, stats.streak);

    await db
      .update(userStats)
      .set({ xp: newXp, hearts: newHearts, heartsUpdatedAt: now, streak: newStreak, lastActive: now })
      .where(eq(userStats.userId, userId));

    // Record the attempt regardless of pass/fail — only progression (crown
    // bump / next-skill unlock) below is gated on passing.
    await db.insert(lessonAttempts).values({ id: randomUUID(), userId, lessonId, correctCount, total });

    // Skill completion / crown / unlock bookkeeping.
    const skillId = lesson.skillId;
    const unlockedSkillIds: string[] = [];

    const skillLessonRows = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.skillId, skillId));
    const skillLessonIds = skillLessonRows.map((r) => r.id);

    const attemptedRows = await db
      .select({
        lessonId: lessonAttempts.lessonId,
        correctCount: lessonAttempts.correctCount,
        total: lessonAttempts.total,
      })
      .from(lessonAttempts)
      .where(and(eq(lessonAttempts.userId, userId), inArray(lessonAttempts.lessonId, skillLessonIds)));
    // A lesson only counts toward skill completion once it has been *passed*
    // at least once (>= PASS_RATIO) — an out-of-hearts 0/10 attempt must not
    // crown the skill or unlock the next one.
    const passedLessonIds = new Set(
      attemptedRows.filter((r) => r.total > 0 && r.correctCount / r.total >= PASS_RATIO).map((r) => r.lessonId),
    );
    const allLessonsPassed = skillLessonIds.every((id) => passedLessonIds.has(id));

    if (allLessonsPassed) {
      const existingProgress = await db
        .select()
        .from(userSkillProgress)
        .where(and(eq(userSkillProgress.userId, userId), eq(userSkillProgress.skillId, skillId)))
        .limit(1);
      const currentCrown = existingProgress[0]?.crownLevel ?? 0;
      const newCrown = Math.min(MAX_CROWN_LEVEL, currentCrown + 1);

      if (existingProgress[0]) {
        await db
          .update(userSkillProgress)
          .set({ crownLevel: newCrown, unlocked: true })
          .where(and(eq(userSkillProgress.userId, userId), eq(userSkillProgress.skillId, skillId)));
      } else {
        await db.insert(userSkillProgress).values({ userId, skillId, crownLevel: newCrown, unlocked: true });
      }

      const nextSkillId = await findNextSkillId(db, skillId);
      if (nextSkillId) {
        const existingNext = await db
          .select()
          .from(userSkillProgress)
          .where(and(eq(userSkillProgress.userId, userId), eq(userSkillProgress.skillId, nextSkillId)))
          .limit(1);
        if (!existingNext[0]) {
          await db.insert(userSkillProgress).values({ userId, skillId: nextSkillId, crownLevel: 0, unlocked: true });
          unlockedSkillIds.push(nextSkillId);
        } else if (!existingNext[0].unlocked) {
          await db
            .update(userSkillProgress)
            .set({ unlocked: true })
            .where(and(eq(userSkillProgress.userId, userId), eq(userSkillProgress.skillId, nextSkillId)));
          unlockedSkillIds.push(nextSkillId);
        }
      }
    }

    const finalStats = {
      userId,
      xp: newXp,
      streak: newStreak,
      hearts: newHearts,
      heartsUpdatedAt: now,
      lastActive: now,
    };

    return { stats: finalStats, unlockedSkillIds };
  });
}
