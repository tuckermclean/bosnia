# B07 — lessons-progress

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B03, B04, B05 | A03, B10 | M |

**Owns:** `backend/src/services/progression.ts`, `backend/src/routes/courses.ts`, `backend/src/routes/progress.ts`, `backend/test/progress.test.ts`

## Purpose

Imported from the code. The lesson engine's server side: the skill tree, the lessons, and xp, hearts, streaks,
crowns and unlocks. Every route here requires a logged-in user (B05).

- `backend/src/services/progression.ts` orders every skill by its unit's `order_index`, then its own.
  `getFirstSkillId` is the first in that order, `findNextSkillId(skillId)` the one after it, and
  `isSkillUnlocked(userId, skillId)` is the user's `user_skill_progress.unlocked` when that row exists, and
  otherwise true only for the first skill.
- `backend/src/routes/courses.ts`:
  - `GET /api/courses` returns every course with its units, skills (title, grammar tip, `reviewStatus`,
    `unlocked`, `crownLevel`) and lessons (id, title, order), sorted by `order_index`, with the caller's
    progress laid over it; without a progress row a skill is unlocked only when it is the first skill of the
    first unit.
  - `GET /api/lessons/:id` answers 404 for an unknown lesson and 403 "Skill is locked" when `isSkillUnlocked` is false;
    otherwise it returns the lesson and its exercises in order, with their full payloads.
- `backend/src/routes/progress.ts`:
  - `GET /api/progress` returns the caller's `stats` and `skillProgress` rows, after regenerating hearts with
    `applyHeartRegen` and saving the result when it changed.
  - `POST /api/progress/lesson-complete` `{lessonId, correctCount, total}` answers 404 for an unknown lesson
    and 403 for a locked one. It clamps `total` to the lesson's exercise count and `correctCount` to `total`
    (OD8), regenerates hearts, then subtracts one heart per wrong answer (not below 0), adds 10 xp per correct
    answer, updates the streak with `computeStreak`, and records the attempt. When every lesson of the skill
    has an attempt of at least 60% correct, the skill's crown rises by one (to at most 5) and it is unlocked,
    and the next skill in course order is unlocked; the newly unlocked skill ids are returned with the stats.
  - `applyHeartRegen(hearts, updatedAt, now)` adds one heart per full 30 minutes, up to 5, and keeps the
    remainder of an unfinished interval; `computeStreak(lastActive, now, streak)` keeps the streak on the same
    UTC day, adds one when the last activity was the UTC day before, and is 1 otherwise.

## Tests

`backend/test/progress.test.ts`: the lesson-complete and progress routes over a two-skill fixture (xp, hearts,
streak, the clamp, locks, the crown and unlock chain, a failing attempt), and `applyHeartRegen` and
`computeStreak` directly. The server's integration test (B10) runs `GET /api/courses`, `GET /api/lessons/:id` and
lesson-complete over the committed curriculum.

## Changes

none: imported

## Gate

- **B07-AC-1** — A first lesson-complete adds 10 xp per correct answer, takes one heart per wrong answer, sets the streak to 1, and saves the stats. *Verify:* `backend/test/progress.test.ts` ("updates xp/streak/hearts and persists a lesson attempt").
- **B07-AC-2** — Activity on the day after the last raises the streak by one, and passing every lesson of a skill returns the next skill in `unlockedSkillIds`. *Verify:* `backend/test/progress.test.ts` ("bumps the streak by one on a second day and unlocks/crowns the completed skill").
- **B07-AC-3** — `GET /api/progress` regenerates hearts for the time elapsed (two hearts after 65 minutes) and saves them. *Verify:* `backend/test/progress.test.ts` ("regenerates hearts over time on GET /progress and persists the regen").
- **B07-AC-4** — lesson-complete clamps `correctCount` to the lesson's exercise count before computing xp. *Verify:* `backend/test/progress.test.ts` ("clamps correctCount/total to the lesson's real exercise count").
- **B07-AC-5** — A lesson of a locked skill is answered 403, by lesson-complete and by `GET /api/lessons/:id`. *Verify:* `backend/test/progress.test.ts` ("rejects lesson-complete for a locked skill's lesson with 403"), `backend/test/progress.test.ts` ("rejects GET /api/lessons/:id for a locked skill's lesson with 403").
- **B07-AC-6** — The first skill's lessons are open to a user without any progress row. *Verify:* `backend/test/progress.test.ts` ("allows GET /api/lessons/:id for the first skill's lesson without any progress row").
- **B07-AC-7** — Passing a skill's lessons sets its crown to 1 and unlocks the next skill, whose lesson then opens and accepts completion. *Verify:* `backend/test/progress.test.ts` ("multi-skill crown->unlock chain: passing skill-1's lesson unlocks skill-2, which then accepts completion").
- **B07-AC-8** — An attempt with no correct answer is answered 200 but neither crowns the skill nor unlocks the next. *Verify:* `backend/test/progress.test.ts` ("a failing attempt (below the pass threshold) does NOT crown the skill or unlock the next one").
- **B07-AC-9** — `applyHeartRegen` never goes above 5 hearts and changes nothing when hearts are full. *Verify:* `backend/test/progress.test.ts` ("never regenerates past the max, even with a huge elapsed time"), `backend/test/progress.test.ts` ("is a no-op once hearts are already full").
- **B07-AC-10** — `computeStreak` resets to 1 after a gap of more than a day, adds one for the previous calendar day, and starts at 1 with no prior activity. *Verify:* `backend/test/progress.test.ts` ("resets to 1 after a gap of more than one day"), `backend/test/progress.test.ts` ("bumps by one for activity exactly one calendar day earlier"), `backend/test/progress.test.ts` ("starts at 1 when there is no prior activity").
- **B07-AC-11** — For a new user, `GET /api/courses` returns the course with the first skill of the first unit unlocked and that unit's other skills locked. *Verify:* `backend/test/integration.test.ts` ("GET /api/courses serves the real seeded A1->B2 course with the first skill of the first unit unlocked").
- **B07-AC-12** — `GET /api/lessons/:id` returns the lesson and its exercises with their payloads. *Verify:* `backend/test/integration.test.ts` ("GET /api/lessons/:id returns the first lesson with populated exercise payloads").
- **B07-AC-13** — An unknown lesson id is answered 404 by `GET /api/lessons/:id` and by lesson-complete. *Verify:* unpinned.
- **B07-AC-14** — A skill's crown level never exceeds 5. *Verify:* unpinned.

## Risks

- `correctCount` and `total` come from the client and are clamped, not regraded (OD8); the exercise payloads,
  answers included, go to the client.
- Hearts gate nothing on the server: at 0 hearts lessons still open and complete.
- lesson-complete sets `hearts_updated_at` to now, dropping the part of a regeneration interval already elapsed.
- Once every lesson of a skill has been passed, each later completion of one of its lessons, a failing one too,
  raises the crown again, up to 5.
- A lesson without exercises can never be passed (its `total` clamps to 0), so its skill never completes.
- Streaks count UTC days, not the learner's.
- B07-AC-2's test fails when the gate runs between 00:00 and 01:00 UTC: it backdates `lastActive` by 25 hours,
  which in that hour is two UTC days back, so `computeStreak` returns 1 and the test's expected streak of 4 fails.
- No test fixes the time zone, and CI runs in UTC, so the tests would pass with `isSameCalendarDay` reading local
  time: nothing pins that streaks count UTC days rather than the host's.
- The stats update, the attempt and the progress rows are separate writes without a transaction; two concurrent
  completions can lose an xp or heart update.
- "First skill" is computed twice: in `courses.ts` from the first unit, and in `progression.ts` from the sorted
  skills; both span every course in the database.
- `GET /api/courses` reads every content table in full on each request.
