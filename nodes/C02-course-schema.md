# C02 — course-schema

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | C01 | C04, C05, C06, C07, C08 | S |

**Owns:** `content/src/schema.ts`, `content/src/paths.ts`

## Purpose

Imported from the code. `content/src/schema.ts` holds the zod schemas (and their inferred TypeScript types) that
every stage parses with:

- the enums: CEFR levels `A1`, `A2`, `B1`, `B2`; review status `unreviewed` or `reviewed`; translation
  direction `bs->en` or `en->bs`; and the five exercise types `multiple_choice`, `word_bank`, `match_pairs`,
  `listen_choose`, `speak`;
- the blueprint: `BlueprintSchema` (`language` the literal `"bs"`, at least one level, at least one unit), units
  (`id`, `level`, `order`, `title`, `titleEn`, `theme`, at least one skill) and skills (`id`, `order`, `title`,
  `titleEn`, `grammarFocus`, a positive integer `targetVocabCount`);
- the course, which its comment calls the fixed contract the backend ingests: `CourseSchema` (`language`
  `"bs"`, at least one unit) → units → skills (`id`, `order`, `title`, `titleEn`, `grammarTip`, `reviewStatus`,
  at least one vocab item `{bs, en, audioHash?}`, at least one lesson) → lessons (at least one exercise) →
  exercises, a union discriminated by `type`. Every exercise has `id`, `prompt` and optional `promptEn` and
  `translationDirection`; `multiple_choice` and `word_bank` add `answer` and at least two `choices`;
  `match_pairs` adds at least two `{bs, en}` pairs; `listen_choose` adds `answer`, at least two `choices`,
  `targetPhrase` and optional `audioHash`; `speak` adds `targetPhrase` and optional `audioHash`. Strings are
  non-empty and orders are non-negative integers;
- the audio manifest: a record from hash to `{url, text, voice}`.

`content/src/paths.ts` names where the pipeline reads and writes: `CONTENT_ROOT` (the package folder), and under a data
root, which is `CONTENT_DATA_ROOT` when that is set (read once, at import) and the package folder otherwise:
`generated/` with `skills/`, `blueprint.json` and `course.json`; `audio-out/` with `manifest.json`; and
`review-export/`. `skillFilePath(id)` is `generated/skills/<id>.json`.

## Tests

`content/test/validate.test.ts` (the `CourseSchema` tests, and the integration test that parses the committed
`course.json`); `content/test/generate-skill.test.ts` and `content/test/synthesize-audio.test.ts` set
`CONTENT_DATA_ROOT` to a temporary folder, reset the module cache and import the stages afresh, which relies on
`paths.ts` reading the variable at import.

## Changes

none: imported

## Gate

- **C02-AC-1** — `CourseSchema` accepts a well-formed course with one exercise of each of the five types. *Verify:* `content/test/validate.test.ts` ("CourseSchema" › "accepts a well-formed course").
- **C02-AC-2** — `CourseSchema` rejects an exercise whose `type` is not one of the five. *Verify:* `content/test/validate.test.ts` ("rejects an exercise with an unknown type").
- **C02-AC-3** — `CourseSchema` rejects a `multiple_choice` exercise without `choices`. *Verify:* `content/test/validate.test.ts` ("rejects a multiple_choice exercise missing choices").
- **C02-AC-4** — `CourseSchema` rejects a course with no units. *Verify:* `content/test/validate.test.ts` ("rejects a course with an empty units array").
- **C02-AC-5** — The committed `content/generated/course.json` parses under `CourseSchema`. *Verify:* `content/test/validate.test.ts` ("committed A1 content (integration)").
- **C02-AC-6** — With `CONTENT_DATA_ROOT` set before import, the skill files and the audio manifest lie under that folder instead of the package folder. *Verify:* `content/test/generate-skill.test.ts` and `content/test/synthesize-audio.test.ts` (they write only under a temporary `CONTENT_DATA_ROOT`).
- **C02-AC-7** — `BlueprintSchema` requires `language` `"bs"`, at least one level and unit, at least one skill per unit, and a positive integer `targetVocabCount` per skill. *Verify:* unpinned (no test parses a blueprint).
- **C02-AC-8** — `AudioManifestSchema` is a record from a hash to `{url, text, voice}`. *Verify:* `content/test/synthesize-audio.test.ts` ("is idempotent: a second run synthesizes nothing new (fully cached)": the second run loads the manifest through `AudioManifestSchema`, and a manifest that failed to parse would count nothing as cached).
- **C02-AC-9** — `AudioManifestSchema` requires the `url`, `text` and `voice` of each entry to be non-empty. *Verify:* unpinned (no test gives the manifest an empty field).
- **C02-AC-10** — With `CONTENT_DATA_ROOT` set before import, `REVIEW_EXPORT_DIR` lies under that folder. *Verify:* unpinned (no test touches `REVIEW_EXPORT_DIR`).

## Risks

- The course schema is a contract with the backend's seed (`backend/scripts/seed-course.ts`,
  `backend/src/auto-seed.ts`), which reads `course.json` and the manifest with its own types; its comment asks for
  lockstep changes. The backend's `integration.test.ts` and `auto-seed.test.ts` seed the committed `course.json`, but no
  test checks `schema.ts` against the seed's own types.
- The schemas check shape only: nothing requires ids to be unique, an `answer` to be among its `choices`, or `order` to
  be consecutive. Of these, only answer-in-choices is checked, by the validator (C05); id uniqueness and consecutive
  `order` are checked nowhere.
- `paths.ts` reads `CONTENT_DATA_ROOT` once at import: a test that sets it after importing a stage writes into
  the real `content/generated/` (out of scope).
- `audioHash` is optional on vocab, `listen_choose` and `speak` only, so the course's audio links depend on
  the audio stage (C06) having stamped them.
