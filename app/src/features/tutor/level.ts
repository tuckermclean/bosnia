import type { CefrLevel, Course } from '@/types/api';

const KNOWN_LEVELS: readonly CefrLevel[] = ['A1', 'A2', 'B1', 'B2'];

function asCefrLevel(level: string): CefrLevel {
  return (KNOWN_LEVELS as readonly string[]).includes(level) ? (level as CefrLevel) : 'A1';
}

/**
 * Derives the learner's current CEFR level from their loaded course/progress
 * data: the level of the highest-ordered unit that has at least one unlocked
 * skill (skill.unlocked already reflects the calling user's progress — see
 * `GET /api/courses`). Falls back to "A1" (the MVP's only course) when course
 * data hasn't loaded yet or nothing is unlocked.
 */
export function deriveLearnerLevel(courses: Course[] | undefined): CefrLevel {
  if (!courses || courses.length === 0) return 'A1';

  let bestLevel: CefrLevel = 'A1';
  let bestOrder = -1;

  for (const course of courses) {
    for (const unit of course.units) {
      const hasUnlockedSkill = unit.skills.some((skill) => skill.unlocked);
      if (hasUnlockedSkill && unit.orderIndex > bestOrder) {
        bestOrder = unit.orderIndex;
        bestLevel = asCefrLevel(unit.level);
      }
    }
  }

  return bestLevel;
}
