import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { skills, units, userSkillProgress } from "../db/schema.js";

/**
 * Whole-course skill ordering: unit `orderIndex`, then skill `orderIndex`.
 * Shared by the unlock check and the "what unlocks next" bookkeeping so both
 * agree on a single course-wide order.
 */
async function getOrderedSkillIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ skillId: skills.id, skillOrder: skills.orderIndex, unitOrder: units.orderIndex })
    .from(skills)
    .innerJoin(units, eq(skills.unitId, units.id));
  return [...rows]
    .sort((a, b) => a.unitOrder - b.unitOrder || a.skillOrder - b.skillOrder)
    .map((r) => r.skillId);
}

/** The very first skill of the very first unit — unlocked by default, even
 * before any `userSkillProgress` row exists for a user. */
export async function getFirstSkillId(db: Db): Promise<string | undefined> {
  const ordered = await getOrderedSkillIds(db);
  return ordered[0];
}

/** The skill immediately after `skillId` in course order, if any. */
export async function findNextSkillId(db: Db, skillId: string): Promise<string | undefined> {
  const ordered = await getOrderedSkillIds(db);
  const idx = ordered.indexOf(skillId);
  if (idx === -1 || idx === ordered.length - 1) return undefined;
  return ordered[idx + 1];
}

/**
 * Server-side source of truth for whether `userId` may access `skillId`'s
 * lessons: an explicit `userSkillProgress` row wins; absent one, only the
 * first skill of the first unit is unlocked by default.
 */
export async function isSkillUnlocked(db: Db, userId: string, skillId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(userSkillProgress)
    .where(and(eq(userSkillProgress.userId, userId), eq(userSkillProgress.skillId, skillId)))
    .limit(1);
  if (rows[0]) return rows[0].unlocked;
  const firstSkillId = await getFirstSkillId(db);
  return skillId === firstSkillId;
}
