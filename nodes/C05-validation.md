# C05 — validation

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | C02 | none | S |

**Owns:** `content/src/validate.ts`, `content/test/validate.test.ts`

## Purpose

Imported from the code. `content/src/validate.ts` (`npm run validate`) parses `generated/course.json` with
`CourseSchema`, runs `validateCourse` and prints `formatReport`: one `[ERROR]` or `[WARNING]` line per issue,
then a count line ending `PASS` or `FAIL`; it exits non-zero when there is an error. `validateCourse` reports:

- errors: a vocab item with a blank `bs` or `en`; an exercise with a blank prompt; a `multiple_choice` or
  `listen_choose` whose choices hold the answer other than exactly once, or hold a duplicate (both compared trimmed and
  lowercased); a `word_bank` whose answer, split on whitespace, needs a word that no choice tile matches; a
  `listen_choose` or `speak` with a blank `targetPhrase`; and a course whose text lacks any of the letters `č ć đ š ž`
  or the digraphs `dž lj nj`. That text is the unit and skill titles, the unit themes, the grammar tips, the vocab `bs`
  and the exercise text, not the lesson titles, `titleEn` or the vocab `en`;
- warnings: the same `bs`/`en` vocab pair in two skills (expected in a spiralling curriculum, so not an error), and the
  same `bs` word in another skill with a different `en`.

`ok` is true when there is no error.

## Tests

`content/test/validate.test.ts`: the `validateCourse` cases on a small course with one exercise of each type,
and an integration test over the committed `content/generated/course.json`. (Its `CourseSchema` cases are
C02's criteria.)

## Changes

none: imported

## Gate

- **C05-AC-1** — A well-formed course gives a report with no error and `ok` true. *Verify:* `content/test/validate.test.ts` ("validateCourse" › "passes a well-formed course with no issues").
- **C05-AC-2** — The same vocab pair in two skills is a warning ("Duplicate vocab"), not an error, and the report stays `ok`. *Verify:* `content/test/validate.test.ts` ("flags exact duplicate vocab across two skills as a warning, not a hard error").
- **C05-AC-3** — A `multiple_choice` exercise whose choices do not hold the answer at all is an error ("exactly one choice"). *Verify:* `content/test/validate.test.ts` ("flags a multiple_choice exercise with zero or duplicate correct answers").
- **C05-AC-4** — A `word_bank` exercise whose choice tiles cannot build the answer is an error. *Verify:* `content/test/validate.test.ts` ("flags a word_bank exercise whose choices can't build the answer").
- **C05-AC-5** — A course whose text holds none of the letters `č ć đ š ž` or the digraphs `dž lj nj` gets at least one diacritic or digraph error. *Verify:* `content/test/validate.test.ts` ("flags a course missing a required Bosnian diacritic/digraph").
- **C05-AC-6** — The committed `content/generated/course.json` validates with no error. *Verify:* `content/test/validate.test.ts` ("committed A1 content (integration)").
- **C05-AC-7** — Duplicate choices in a `multiple_choice` or `listen_choose` exercise, a blank vocab translation, a blank prompt and a blank `targetPhrase` are errors. *Verify:* unpinned.
- **C05-AC-8** — `npm run validate` prints one line per issue and a final count line with `PASS` or `FAIL`, and exits non-zero on any error. *Verify:* unpinned.
- **C05-AC-9** — A `multiple_choice` or `listen_choose` exercise whose choices hold the answer more than once is an error, and each missing letter or digraph gets its own error. *Verify:* unpinned (the tests cover only an answer missing from the choices, and only that some diacritic error is reported).

## Risks

- The integration test reads the committed curriculum, which is out of scope: an owner's content change that
  breaks a hygiene rule turns the content suite red, though no node changed code. Its name still says "A1".
- The file's header comment says an exact duplicate vocab pair is a hard error; the code and the test make it a warning.
- The diacritics check is course-wide: one occurrence of each letter anywhere passes, so it cannot catch a
  skill written without diacritics.
- Nothing checks that ids (units, skills, lessons, exercises) are unique, or that a skill file's id matches its
  name, though the review tooling (C07) relies on them.
- `npm run validate` is not run in CI; only the integration test above calls `validateCourse` over the committed course
  (directly, not through `npm run validate`).
