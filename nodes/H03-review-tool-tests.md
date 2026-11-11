# H03 — review-tool-tests

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | S |

**Owns:** `content/test/` (new review tests and any fixture they need), `content/src/export-review.ts` and `content/src/apply-review.ts` (only if a test exposes a defect)

## Purpose

The native-speaker review is the only path from `unreviewed` to `reviewed` (principle 3), and its two
tools have no tests (`docs/AUDIT.md`, A5). `export-review` writes one Markdown and one CSV file per
unit with stable row ids (`<skillId>-vocab-<n>`, `<exerciseId>-pair-<n>`, `<exerciseId>-target`);
`apply-review <unitId>` applies the CSV's `correction` column (a plain value corrects the Bosnian, an
`en:` prefix the English), marks every skill of the unit `reviewed` and reassembles `course.json`.

The behaviour exists, so this node mainly adds tests. Criteria the new tests already meet at RED are
recorded as `already_satisfied`; the PR still carries the tests. A test that fails shows a defect,
which GREEN fixes.

## Tests

New vitest tests in `content/test/`, working on a temporary copy of a small course (never on
`content/generated/`). The tools read fixed paths from `content/src/paths.ts`; the tests may point
them at a temporary directory (e.g. through an environment variable the implementer adds) if the
paths cannot be injected today. Red target: `npm run test -w @bosanski/content -- test/review.test.ts`.

## Changes

1. Tests for `buildReviewRows`, `toCsv` and `toMarkdown`. *H03-AC-1, H03-AC-2.*
2. Tests for `applyReview` on a temporary course. *H03-AC-3, H03-AC-4, H03-AC-5.*
3. Only if needed for the tests to run in isolation: make the content paths overridable without
   changing their defaults. *H03-AC-3.*

## Gate

- **H03-AC-1** — `buildReviewRows` yields one row per vocab item, per match pair, and per listen_choose and speak target phrase, with the documented stable ids. *Verify:* a vitest test on a small unit checks the ids and count.
- **H03-AC-2** — The CSV export has the header `id,bosnian,english,notes,correction` and escapes commas, quotes and newlines so `parseCsv` reads back the same values; the Markdown escapes `|`. *Verify:* a vitest round-trip test.
- **H03-AC-3** — `applyReview` applies a plain correction to the Bosnian text and an `en:` correction to the English gloss, for vocab, pairs and listen_choose targets, and writes the changed skill files. *Verify:* a vitest test on a temporary course copy.
- **H03-AC-4** — After `applyReview`, every skill of that unit is `reviewed`, skills of other units are unchanged, and the reassembled `course.json` reflects the corrections. *Verify:* a vitest test on a temporary course copy.
- **H03-AC-5** — A row whose id matches no item is skipped with a warning and does not stop the run; the unit is still marked reviewed (current behaviour, OD4). *Verify:* a vitest test with an unknown row id.

## Risks

- OD4: if the owner decides that a partial apply must not sign off the unit, AC-5 changes; that is a
  spec change before this node is built.
- Tests must never write into `content/generated/` or `content/review-export/` of the repository.
