# B13 — doc-scripts

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | B01, C01, D04 | none | S |

**Owns:** `backend/test/doc-scripts.test.ts`
**Resolves:** #16

## Purpose

`backend/package.json` (B01) defines `db:migrate` as `tsx src/db/migrate.ts`, but `backend/src/db/migrate.ts` does
not exist, and `db:generate` as `drizzle-kit generate`, which needs a `drizzle.config.ts` the repository lacks.
`DEPLOY.md` §4 (D04) tells the operator that these two scripts generate and apply migrations. Neither works: the
schema comes only from `initSchema()` (B03), which runs `CREATE TABLE IF NOT EXISTS` on every backend boot and
never changes an existing table. `content/README.md` (C01) has the same kind of dead command: its stage table
documents `npm run seed-a1`, a script that `content/package.json` does not define.

This node removes the two dangling backend scripts. It rewrites `DEPLOY.md` §4 to say that the schema comes only
from `initSchema()` on boot, and that a change to a column or type of an existing table needs a manual step
until migrations are built (OD5, priority 6). It drops the `npm run seed-a1` row from `content/README.md`. A
backend test then keeps the docs and the package scripts in step: every `npm run <script>` that `DEPLOY.md` or
`content/README.md` names exists in the named package's `package.json`; every `tsx` script of the backend and
content packages runs a file that exists; and no script runs `drizzle-kit` while there is no
`backend/drizzle.config.ts`.

## Tests

`backend/test/doc-scripts.test.ts` (vitest, no key, no database, no network). It reads `DEPLOY.md`,
`content/README.md`, the root `package.json`, `backend/package.json` and `content/package.json` from the
repository, with paths resolved from the test file's own location.

- **The parser.** A function, local to the test file, that takes a document's text and returns each
  `npm run <script>` it names (and each `npm test`, as the script `test`), along with the package the command
  names: the workspace given by `-w <name>`, `--workspace <name>` or `--workspace=<name>` on the same command,
  or else the document's own package (the content package for `content/README.md`, the root package for
  `DEPLOY.md`). Arguments after `--` are not script names. Cases on inline sample text check it: a `-w` command,
  a `--workspace=` command, a bare command, a command with `-- <args>`, and a line with no command.
- **The docs.** For `DEPLOY.md` and `content/README.md`, every command the parser finds names a script that
  exists in that package's `scripts`. A failure lists each missing script with its document and package. As a
  check that the parser is not passing on nothing, the commands it finds in `content/README.md` include the six
  stage scripts (`blueprint`, `generate`, `validate`, `audio`, `export-review`, `apply-review`).
- **The scripts.** Every script of `backend/package.json` and `content/package.json` that runs `tsx <path>` or
  `tsx watch <path>` names a file that exists, relative to that package's folder. No script of either package
  runs `drizzle-kit` while `backend/drizzle.config.ts` does not exist.

Today the test fails three ways: `seed-a1` is missing from `content/package.json`, `db:migrate` runs a missing
file, and `db:generate` runs `drizzle-kit` with no config.

## Changes

- `backend/package.json`: remove the `db:migrate` and `db:generate` scripts. Every other script, and every
  dependency, stays as it is. `drizzle-kit` stays a devDependency for the migrations of OD5.
- `DEPLOY.md` §4: say that the schema comes only from `initSchema()`, which creates missing tables on every
  backend boot (for PGlite and for Postgres), so a fresh database needs no step. Say that `initSchema()` never
  changes an existing table, so a change to a column or a type of an existing table needs a manual step: the
  operator applies the SQL by hand (e.g. with `psql` against `DATABASE_URL`) before rolling out the image that
  needs it. Say that migrations are planned (drizzle-kit migrations applied by their own step, `SPEC.md` OD5)
  and not built. §4 names no `db:migrate` or `db:generate` command and no `npm run` command for migrations.
  The other sections do not change.
- `content/README.md`: remove the `npm run seed-a1` row from the stage table. The rest of the file does not
  change.
- `backend/test/doc-scripts.test.ts`: new, the cases above.

## Gate

- **B13-AC-1** — `backend/package.json` defines neither `db:migrate` nor `db:generate`, and its other scripts and its dependencies are unchanged. *Verify:* `npm test -w @bosanski/backend -- test/doc-scripts.test.ts` (the `tsx` and `drizzle-kit` cases), and the reviewer compares `backend/package.json` with `main`.
- **B13-AC-2** — Every `tsx <path>` or `tsx watch <path>` script of `backend/package.json` and `content/package.json` names a file that exists, relative to its package's folder, and no script of either package runs `drizzle-kit` while `backend/drizzle.config.ts` does not exist. *Verify:* `npm test -w @bosanski/backend -- test/doc-scripts.test.ts`.
- **B13-AC-3** — Every `npm run <script>` (and `npm test`) that `DEPLOY.md` or `content/README.md` names exists in the `scripts` of the package the command names (its `-w`/`--workspace` package, else the document's own package), and the commands found in `content/README.md` include the six stage scripts. *Verify:* `npm test -w @bosanski/backend -- test/doc-scripts.test.ts`.
- **B13-AC-4** — The test's parser, run on inline samples, finds the script and package of a `-w` command, a `--workspace=` command and a bare command, does not take the arguments after `--` as script names, and finds nothing in a line with no command. *Verify:* `npm test -w @bosanski/backend -- test/doc-scripts.test.ts`.
- **B13-AC-5** — `DEPLOY.md` §4 says the schema comes only from `initSchema()` on boot, which creates missing tables and never changes an existing one; that a change to a column or type of an existing table needs a manual step before the rollout that needs it; and that migrations are planned, not built. It names no `db:migrate`, `db:generate` or other migration command, and the other sections are unchanged. *Verify:* the reviewer reads §4 against `backend/src/db/client.ts` and `backend/src/db/ddl.ts`, and diffs the rest of `DEPLOY.md` with `main`.
- **B13-AC-6** — `content/README.md` has no `npm run seed-a1` row, and nothing else in it changes. *Verify:* `npm test -w @bosanski/backend -- test/doc-scripts.test.ts` (B13-AC-3), and the reviewer diffs the file with `main`.
- **B13-AC-7** — The backend suite and `npm run typecheck -w @bosanski/backend` pass. *Verify:* `npm test -w @bosanski/backend`, and CI's backend job runs the typecheck.

## Risks

- The test covers only `DEPLOY.md` and `content/README.md`, as the issue asks. `README.md` and `backend/README.md`
  also name `npm` commands, and nothing checks those. `backend/README.md`'s `npm start` runs a `start` script
  whose `dist/index.js` path is wrong (B01), and the `tsx` check does not catch that, because `start` runs `node`.
- After this change `DEPLOY.md` names no `npm run` command, so its half of the check passes on nothing until a
  later change adds one. The parser cases (B13-AC-4) and the content README's stage scripts (B13-AC-3) keep
  the check from passing vacuously everywhere.
- `content/scripts/seed-a1.ts` (C08) stays. It is still run with `npx tsx scripts/seed-a1.ts`, and running it
  still overwrites committed curriculum data (C08, Risks). Deleting it would leave C08 owning no file, which
  takes its own spec change.
- `drizzle-kit` stays an unused devDependency, and `backend/tsconfig.json` still includes a `drizzle.config.ts`
  that does not exist, until the migrations of OD5 are built.
- The manual step for a column or type change is the operator's to get right: nothing checks that the SQL they
  apply matches `backend/src/db/schema.ts`.
- B12 changes `DEPLOY.md` §3a and §5, and the open spec PR for D05 plans changes to §3 and §6. This node changes
  only §4, so their PRs can conflict only in nearby lines.
