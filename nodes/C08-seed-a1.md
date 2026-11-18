# C08 — seed-a1

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | C02 | none | S |

**Owns:** `content/scripts/seed-a1.ts`

## Purpose

Imported from the code. `content/scripts/seed-a1.ts` is a one-off script, run with `npx tsx scripts/seed-a1.ts`
from `content/`, from the time no LLM key was available. It holds a hand-written A1 unit, `a1-u1` "Osnove"
(Basics), of five skills (`a1-u1-s1` to `a1-u1-s5`: greetings, introductions, numbers, colours and family),
each with vocab, a grammar tip and one lesson, all `unreviewed`. It validates them with the pipeline's schemas
(C02) and writes a one-unit A1 blueprint, the five skill files and a one-unit `course.json` to the paths of
`paths.ts`, then prints the counts. It runs `main()` on import.

## Tests

None: no test runs or imports the script. CI's `npm run typecheck -w @bosanski/content` compiles it.

## Changes

none: imported

## Gate

- **C08-AC-1** — The script writes a blueprint of one A1 unit, the five `a1-u1` skill files and a `course.json` of that one unit, each validated by the pipeline's schemas, all `unreviewed`. *Verify:* unpinned.
- **C08-AC-2** — The script compiles under the package's typecheck. *Verify:* unpinned (CI's typecheck step, not a test).

## Risks

- Running it overwrites the committed A1→B2 blueprint and `course.json` with a single A1 unit, and the five
  `a1-u1` skill files with versions that have no `audioHash`: it destroys out-of-scope curriculum data. A
  hygiene node is to remove it and the README's `npm run seed-a1` line (`SPEC.md`, Known gaps).
- `content/README.md` documents `npm run seed-a1`, which no package script defines (C01).
- Its header says it writes to `content/generated/`, but it writes under `CONTENT_DATA_ROOT` when that is set.
