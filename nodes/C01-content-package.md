# C01 — content-package

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | R01 | C02, C03 | S |

**Owns:** `content/README.md`, `content/package.json`, `content/tsconfig.json`, `content/vitest.config.ts`

## Purpose

Imported from the code. `content/package.json` makes `content/` the workspace package `@bosanski/content` (private, ES
modules, version 0.1.0). Its scripts run each pipeline stage with `tsx`: `blueprint` (`src/blueprint.ts`), `generate`
(`src/generate.ts`), `validate` (`src/validate.ts`), `audio` (`src/synthesize-audio.ts`), `export-review`
(`src/export-review.ts`) and `apply-review` (`src/apply-review.ts`); `test` is `vitest run`, `test:watch` is `vitest`,
and `typecheck` is `tsc -p tsconfig.json --noEmit`. Its runtime dependencies are `@anthropic-ai/sdk`, `openai` and
`zod`; its dev dependencies are `@types/node`, `tsx`, `typescript` and `vitest`. All of them are caret ranges, and the
root lockfile (R01) pins them.

`content/tsconfig.json` extends the root `tsconfig.base.json` (R01), adds the Node types and compiles `src/`,
`test/` and `scripts/` (so the typecheck covers the tests and `scripts/seed-a1.ts`). `content/vitest.config.ts`
runs `test/**/*.test.ts` in the Node environment with vitest globals on.

`content/README.md` describes the package: it produces the canonical `generated/course.json`, a reference-audio
manifest and the native-speaker review tooling, and never touches a database (the backend's seed ingests the
JSON). It has a table of the stage commands, the command sequence for generating the full course, and the
environment variables (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`,
`AZURE_TTS_VOICE`, `CONTENT_DATA_ROOT`), and warns that all generated Bosnian is unreviewed until a native
speaker signs off.

## Tests

No test reads these files. Every content test runs through `package.json` and `vitest.config.ts`: the gate's
`npm run test -w @bosanski/content` runs the package's `test` script, which runs vitest with `vitest.config.ts`. CI's
`npm run typecheck -w @bosanski/content` compiles under `tsconfig.json`; it is not a test.

## Changes

none: imported

## Gate

- **C01-AC-1** — `npm run test -w @bosanski/content` runs vitest once (not in watch mode) over `content/test/**/*.test.ts` in the Node environment. *Verify:* unpinned (every content test file runs through it; no test reads the config).
- **C01-AC-2** — The package defines one script per pipeline stage (`blueprint`, `generate`, `validate`, `audio`, `export-review`, `apply-review`), each running its `src/` module with `tsx`. *Verify:* unpinned.
- **C01-AC-3** — `npm run typecheck -w @bosanski/content` compiles `src/`, `test/` and `scripts/` under the root's strict options without emitting files. *Verify:* unpinned (CI's typecheck step, not a test).
- **C01-AC-4** — The package's runtime dependencies are `@anthropic-ai/sdk`, `openai` and `zod`. *Verify:* unpinned.
- **C01-AC-5** — `content/README.md` documents each stage command, the order for generating the full course, the environment variables the pipeline reads, and that generated content stays `unreviewed` until a native speaker signs off. *Verify:* unpinned.

## Risks

- `content/README.md` is stale (`SPEC.md`, Known gaps): it says the committed content is "A1 only" and
  hand-authored, but the committed curriculum is A1→B2 (29 skills); it documents `npm run seed-a1`, which no
  script defines (`scripts/seed-a1.ts` is run with `npx tsx`, C08).
- The README says audio runs dry when `AZURE_SPEECH_KEY` is unset; the code also runs dry when only
  `AZURE_SPEECH_REGION` is unset (C06). It says `apply-review` flips "items" to reviewed; the code flips every
  skill of the unit (C07).
- The dependencies are caret ranges: the lockfile (R01) is what pins them, so a bump within the range changes only
  `package-lock.json`, and one past it changes `content/package.json` too (principle 6).
- The stage scripts run plain `tsx`, so they do not load the root `.env`: their keys must be exported in the
  shell, as the README shows.
- The content suite includes an integration test over the committed `content/generated/course.json` (C05), so
  the gate depends on out-of-scope curriculum data.
