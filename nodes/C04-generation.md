# C04 — generation

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | C02, C03 | C06, C07 | M |

**Owns:** `content/src/blueprint.ts`, `content/src/generate-skill.ts`, `content/src/generate.ts`, `content/test/generate-skill.test.ts`

## Purpose

Imported from the code. The first two pipeline stages and the course assembly.

- `content/src/blueprint.ts` (`npm run blueprint`): `generateBlueprint` asks the LLM for a CEFR course
  skeleton for the levels A1, A2, B1 and B2 (units with themes, skills with a grammar focus and a target vocab
  count of 8 to 14, ids like `a1-u1-s1`), parses it with `BlueprintSchema` and writes
  `generated/blueprint.json`. It is idempotent: a cached blueprint is returned without an LLM call unless
  `--force` (`force: true`) is given.
- `content/src/generate-skill.ts`: `generateSkill(unit, skill)` asks the LLM for one skill's full content
  (grammar tip, vocab, one lesson of six exercises covering all five types, `reviewStatus` `unreviewed`),
  parses it with `SkillSchema`, then runs a self-review pass, a second call that asks the LLM to correct the
  draft in the same shape. When the self-review call fails or its reply does not parse, the validated draft is
  kept. The result is written to `generated/skills/<id>.json`. An existing skill file is returned as-is
  (`skipped: true`) without an LLM call unless `force` is set; `selfReview: false` skips the second pass.
- `content/src/generate.ts` (`npm run generate`): `runGenerate` uses the cached blueprint (or generates one),
  generates every skill it lists, skipping cached ones (`--force` regenerates the blueprint and every skill),
  then `assembleCourse` reads every skill file the blueprint lists, in `order`, into `generated/course.json`,
  validated by `CourseSchema`. `assembleCourse` throws when there is no blueprint or a skill file is missing;
  the audio (C06) and apply-review (C07) stages call it too.

Each stage file runs its `main()` only when executed directly, and sets a non-zero exit code on an error.

## Tests

`content/test/generate-skill.test.ts`: `generateSkill` with a `MockProvider` under a temporary
`CONTENT_DATA_ROOT` (first run, cached second run, `force`, self-review fallback). No test covers
`blueprint.ts`, `runGenerate` or `assembleCourse`.

## Changes

none: imported

## Gate

- **C04-AC-1** — On a first run, `generateSkill` writes the skill file and makes two LLM calls, the draft and the self-review. *Verify:* `content/test/generate-skill.test.ts` ("generates and writes a skill file on first run, calling the LLM (draft + self-review)").
- **C04-AC-2** — A second run without `force` returns the cached skill (`skipped: true`) and makes no LLM call. *Verify:* `content/test/generate-skill.test.ts` ("skips regeneration (no LLM call) on a second run without --force").
- **C04-AC-3** — With `force: true`, `generateSkill` regenerates a skill whose file exists (two more LLM calls). *Verify:* `content/test/generate-skill.test.ts` ("regenerates when force:true is passed, even if a cached file exists").
- **C04-AC-4** — When the self-review reply is not valid JSON, `generateSkill` keeps the validated draft. *Verify:* `content/test/generate-skill.test.ts` ("falls back to the validated draft if the self-review pass returns garbage").
- **C04-AC-5** — `generateBlueprint` returns the cached `generated/blueprint.json` without an LLM call unless `force` is set, and otherwise writes the schema-validated blueprint for A1→B2. *Verify:* unpinned.
- **C04-AC-6** — `assembleCourse` writes `generated/course.json` from the blueprint's units and skills in `order`, and throws naming the skill when a skill file is missing, or when there is no blueprint. *Verify:* unpinned.
- **C04-AC-7** — `runGenerate` generates only the skills without a file (all of them, and the blueprint, with `--force`), then assembles the course. *Verify:* unpinned.

## Risks

- Generation spends the owner's LLM credit and writes into `content/generated/`, which is out of scope for
  nodes: a node may change this code but never run it against the committed curriculum.
- The self-review pass swallows every error, network failures included, and nothing checks that the reviewed
  skill kept the draft's ids, as the prompt asks.
- Neither the blueprint nor the skill stage checks that the LLM's ids are unique or follow the
  `<level>-u<n>-s<n>` pattern that the review tooling (C07) parses; only the prompts ask for it.
- A run without an LLM key falls back to `MockProvider` and fails on a schema error rather than naming the
  missing key (C03).
- The "run when executed directly" check compares `import.meta.url` with `file://` plus `process.argv[1]`;
  a path that needs URL escaping (a space, say) never runs `main()`, silently.
