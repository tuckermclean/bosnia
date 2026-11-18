# C07 — review-tooling

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | C02, C04 | none | M |

**Owns:** `content/src/csv.ts`, `content/src/export-review.ts`, `content/src/apply-review.ts`

## Purpose

Imported from the code. The native-speaker review round trip.

- `content/src/csv.ts`: dependency-free CSV helpers. `escapeCsvField` quotes a field holding a quote, comma or
  line break (doubling quotes); `toCsvRow` joins escaped fields; `parseCsv` reads quoted fields (with doubled
  quotes and embedded line breaks), drops a `\r` before a line break, and skips blank lines.
- `content/src/export-review.ts` (`npm run export-review`): reads `generated/course.json` and, per unit, writes
  `review-export/<unitId>.md` (a heading with the unit's titles and level, its theme, instructions, and a table with an
  empty Correction column) and `review-export/<unitId>.csv` (columns `id`, `bosnian`, `english`, `notes`, `correction`).
  One row per vocab item (`<skillId>-vocab-<n>`), per `match_pairs` pair (`<exerciseId>-pair-<n>`), and per
  `listen_choose` target (`<exerciseId>-target`, the English being the exercise's answer) or `speak` target (no
  English). Row ids are derived from the course alone, numbered from 1.
- `content/src/apply-review.ts` (`npm run apply-review -- <unitId>`): reads `review-export/<unitId>.csv`, and for each
  row with a correction finds the skill from the row id and applies it: a plain value replaces the Bosnian text (vocab
  `bs`, pair `bs`, or `targetPhrase`), a value starting `en:` replaces the English (vocab `en`, pair `en`, or a
  `listen_choose` answer; a `speak` target has none). A row whose id has no `-u<n>-s<n>` part, or names a missing item
  of an existing skill, is skipped with a warning; a row whose id names a skill file that does not exist
  (`a1-u9-s1-vocab-1`, say) makes the run throw before it writes anything. Then every skill file of the unit
  (`<unitId>-s*.json`) is set to `reviewed`, the touched skills are written back, and `course.json` is reassembled
  (C04). Without a unit id it prints its usage and exits non-zero; a CSV without an `id` or a `correction` column fails.

`review-export/` is ignored by git (R03).

## Tests

None: no test covers `csv.ts`, `export-review.ts` or `apply-review.ts` (tests for the review tool are
priority 6 in `SPEC.md`).

## Changes

none: imported

## Gate

- **C07-AC-1** — `parseCsv` reads back what `toCsvRow` writes, including fields with quotes, commas and line breaks. *Verify:* unpinned.
- **C07-AC-2** — `export-review` writes one Markdown and one CSV file per unit of `course.json`, with one row per vocab item, `match_pairs` pair and `listen_choose`/`speak` target, under the ids `<skillId>-vocab-<n>`, `<exerciseId>-pair-<n>` and `<exerciseId>-target`. *Verify:* unpinned.
- **C07-AC-3** — `apply-review <unitId>` applies each row's correction to the item its id names: a plain value to the Bosnian text, an `en:` value to the English. A row whose id has no `-u<n>-s<n>` part, or names a missing item of an existing skill, is skipped with a warning; a row whose id names a skill file that does not exist fails the run before anything is written. *Verify:* unpinned.
- **C07-AC-4** — `apply-review <unitId>` sets every skill of the unit to `reviewed`, writes the skill files back and reassembles `course.json`. *Verify:* unpinned.
- **C07-AC-5** — `apply-review` without a unit id prints its usage and exits non-zero. *Verify:* unpinned.

## Risks

- Running `apply-review` over a unit is the sign-off: it marks every skill of the unit `reviewed` even when
  the CSV has no correction, so running it on an unreviewed export breaks principle 3.
- Row ids are positional (`-vocab-3`, `-pair-2`): applying a CSV exported before the content was regenerated
  or edited corrects the wrong items, silently.
- The skill id is taken from a row id by the regular expression `^(.*-u\d+-s\d+)`; rows whose id does not match are
  skipped with a warning. A row naming a skill that has no file stops the run with nothing written.
- The sign-off marks only the skill files named `<unitId>-s*` (`apply-review.ts:126`), so a skill whose id does not
  start with its unit's id is never marked `reviewed`.
- A correction to a vocab word or target phrase does not refresh its `audioHash`, so the audio stays that of
  the old text until `npm run audio` runs again (C06).
- The Markdown table escapes `|` but not line breaks, so a multi-line text breaks its row.
- These modules write into `content/generated/`, which is out of scope: a node may change this code but never
  run it against the committed curriculum. The code is untested.
