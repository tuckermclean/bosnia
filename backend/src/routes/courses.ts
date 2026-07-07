import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { courses, units, skills, lessons, exercises, userSkillProgress } from "../db/schema.js";
import { HttpError, requireAuth, userIdOf } from "../http.js";
import { isSkillUnlocked } from "../services/progression.js";

/**
 * `GET /api/courses` — the full content tree (units -> skills -> lesson metadata),
 * overlaid with the calling user's per-skill progress. `GET /api/lessons/:id` —
 * a single lesson with its full exercise payloads, for the lesson runner.
 */
export function courseRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  app.get("/api/courses", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);

    const [courseRows, unitRows, skillRows, lessonRows, progressRows] = await Promise.all([
      db.select().from(courses),
      db.select().from(units),
      db.select().from(skills),
      db.select().from(lessons),
      db.select().from(userSkillProgress).where(eq(userSkillProgress.userId, userId)),
    ]);

    const progressBySkill = new Map(progressRows.map((p) => [p.skillId, p]));

    const sortedUnits = [...unitRows].sort((a, b) => a.orderIndex - b.orderIndex);
    const firstUnit = sortedUnits[0];
    const firstUnitSkills = firstUnit
      ? skillRows.filter((s) => s.unitId === firstUnit.id).sort((a, b) => a.orderIndex - b.orderIndex)
      : [];
    // The very first skill of the very first unit is unlocked by default, even
    // before any userSkillProgress row exists for this user.
    const firstSkillId = firstUnitSkills[0]?.id;

    const courseList = courseRows.map((course) => {
      const courseUnits = sortedUnits
        .filter((u) => u.courseId === course.id)
        .map((unit) => {
          const unitSkills = skillRows
            .filter((s) => s.unitId === unit.id)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((skill) => {
              const progress = progressBySkill.get(skill.id);
              const skillLessons = lessonRows
                .filter((l) => l.skillId === skill.id)
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map((l) => ({ id: l.id, title: l.title, orderIndex: l.orderIndex }));
              return {
                id: skill.id,
                title: skill.title,
                titleEn: skill.titleEn,
                grammarTip: skill.grammarTip,
                orderIndex: skill.orderIndex,
                reviewStatus: skill.reviewStatus,
                unlocked: progress?.unlocked ?? skill.id === firstSkillId,
                crownLevel: progress?.crownLevel ?? 0,
                lessons: skillLessons,
              };
            });
          return {
            id: unit.id,
            level: unit.level,
            title: unit.title,
            titleEn: unit.titleEn,
            theme: unit.theme,
            orderIndex: unit.orderIndex,
            skills: unitSkills,
          };
        });
      return { id: course.id, language: course.language, title: course.title, units: courseUnits };
    });

    return { courses: courseList };
  });

  app.get("/api/lessons/:id", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);

    const lessonRows = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
    const lesson = lessonRows[0];
    if (!lesson) throw new HttpError(404, "Lesson not found");

    // Server-side unlock enforcement: the client-side lock is UX only, so
    // re-check here rather than trusting that the app wouldn't have let the
    // user navigate to a locked lesson.
    if (!(await isSkillUnlocked(db, userId, lesson.skillId))) {
      throw new HttpError(403, "Skill is locked");
    }

    const exerciseRows = (await db.select().from(exercises).where(eq(exercises.lessonId, id))).sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );

    return {
      lesson: { id: lesson.id, title: lesson.title, skillId: lesson.skillId, orderIndex: lesson.orderIndex },
      exercises: exerciseRows,
    };
  });
}
