# B06 — course-seed

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B03, C02 | B10, B11 | S |

**Owns:** `backend/scripts/seed-course.ts`, `backend/src/auto-seed.ts`, `backend/test/auto-seed.test.ts`

## Purpose

Imported from the code. Loading the curriculum the content pipeline generates (its course contract, C02) into
the database.

- `backend/scripts/seed-course.ts` exports `seedCourse(db, course, manifest = {})`, which upserts by id the
  one course (`COURSE_ID` `bs-a1-b2`, `COURSE_TITLE` "Bosnian A1–B2", since `course.json` carries no id or
  title), then each unit, skill, lesson and exercise. An exercise's `order_index` is its position in the lesson,
  its `review_status` is its skill's, and its payload carries the prompt, translation, answer, choices, pairs,
  target phrase, direction and an `audioUrl` taken from the manifest entry of its `audioHash`. It returns the
  counts of units, skills, lessons and exercises, and how many `audioHash` values the manifest had (hits) or
  lacked (misses). It also exports the `Raw*` input types and the manifest types.
- Run directly (`npm run seed`, or the compiled `dist/scripts/seed-course.js` of the seed Job), it reads
  `<CONTENT_DIR>/generated/course.json` and `<CONTENT_DIR>/audio-out/manifest.json`, where `CONTENT_DIR`
  defaults to the sibling `content/` folder. Without `course.json` it prints that there is nothing to seed and
  exits 0; without a manifest it seeds with no audio URLs. It opens the database (B03), runs `initSchema()`,
  seeds, prints the counts and closes. Imported as a module, it runs nothing.
- `backend/src/auto-seed.ts`: `maybeAutoSeed(db, log)`, which the server (B10) calls at boot by default in local dev.
  When the `courses` table already has a row it does nothing (`not-empty`); else it reads the same two files and seeds
  them through `seedCourse`, logging the unit and skill counts. A missing `course.json` (`no-course-json`) or any error
  (`error`) is logged and returned, never thrown, so the server boots regardless.

## Tests

`backend/test/auto-seed.test.ts`: `maybeAutoSeed` on an empty database seeds the committed
`content/generated/course.json` under `COURSE_ID`, returns counts of units, skills, lessons and exercises above zero,
and logs it; it does nothing on a database that already has a course. The server's integration test (B10) seeds the same
file with `seedCourse` and checks the counts it returns against it. No test covers the CLI, the manifest's audio URLs,
`CONTENT_DIR`, re-seeding, or the `no-course-json` and `error` outcomes.

## Changes

none: imported

## Gate

- **B06-AC-1** — `maybeAutoSeed` on an empty database seeds the committed course under `COURSE_ID`, returns counts of units, skills, lessons and exercises above zero, and logs it. *Verify:* `backend/test/auto-seed.test.ts` ("seeds the real generated course content into a fresh, empty DB").
- **B06-AC-2** — `maybeAutoSeed` on a database that already has a course changes nothing and logs nothing. *Verify:* `backend/test/auto-seed.test.ts` ("no-ops when the DB already has course rows").
- **B06-AC-3** — `seedCourse` returns counts of units, skills, lessons and exercises equal to `course.json`'s. *Verify:* `backend/test/integration.test.ts` (the `beforeAll` of "end-to-end: real seeded content through the API", which compares the counts with `course.json`).
- **B06-AC-4** — Seeding again upserts every row by id, so a re-run after the content changes updates rows rather than failing. *Verify:* unpinned.
- **B06-AC-5** — An exercise's `audioUrl` is the manifest entry's `url` for its `audioHash`, and each exercise takes its skill's `review_status`. *Verify:* unpinned.
- **B06-AC-6** — The seed CLI exits 0 with a message when `course.json` is missing, and reads its files under `CONTENT_DIR` when set. *Verify:* unpinned.
- **B06-AC-7** — `maybeAutoSeed` never throws: a missing `course.json` or an error is logged and returned as `seeded: false`. *Verify:* unpinned.

## Risks

- `seedCourse` never deletes: a unit, skill, lesson or exercise removed from the content stays in the database
  and is still served.
- It runs one upsert per row without a transaction, so a failure leaves a partial seed; an auto-seed that failed
  half-way leaves a course row, and the next boot then skips seeding (`not-empty`).
- The seed casts `course.json` to `RawCourse` without parsing it, and nothing checks that `RawCourse` matches the
  content's `CourseSchema` (C02); the two are kept in step by hand.
- The manifest's URLs are copied as they are: a placeholder or a relative path never plays (OD4, priority 5).
- The auto-seed test and the integration test read the committed curriculum (`content/generated/`, out of scope
  for nodes), so a regeneration by the owner changes what they seed.
