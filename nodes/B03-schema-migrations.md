# B03 — schema-migrations

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | M |

**Owns:** `backend/drizzle.config.ts` (new), `backend/drizzle/` (new migrations), `backend/src/db/migrate.ts` (new), `backend/src/db/client.ts`, `backend/src/db/ddl.ts` (removed once migrations replace it), `backend/src/index.ts` (boot calls the migrations), `backend/package.json`, `backend/tsconfig.json`, `backend/Dockerfile` (ship the migrations), `deploy/migrate-job.yaml` (new), `DEPLOY.md`, `backend/README.md` (database section)

## Purpose

`npm run db:migrate` runs `src/db/migrate.ts`, which does not exist; `npm run db:generate` finds no
drizzle config; there is no migrations folder; `tsconfig.json` includes a missing
`drizzle.config.ts` (`docs/AUDIT.md`, D6). The schema is created by `initSchema()` running
`CREATE TABLE IF NOT EXISTS` on every boot with no lock, and the deployment runs two replicas, which
can race on a fresh database (D5). The owner chose real drizzle-kit migrations with an advisory lock
and a pre-deploy Job (Q4). How existing databases and boots are handled is OD8.

## Tests

Keep every backend test; they must run on migrations instead of the DDL string. Add vitest tests for
the migration runner, a baseline test against the old DDL (kept as a fixture under `backend/test/`),
and the lock. Red target, e.g. `npm test -w @bosanski/backend -- test/migrate.test.ts`.

## Changes

1. `drizzle.config.ts` and an initial migration in `backend/drizzle/` generated from `schema.ts`,
   edited to `IF NOT EXISTS` so it applies to databases the old DDL created (OD8). *B03-AC-1,
   B03-AC-3.*
2. `src/db/migrate.ts` exports a function that applies the migrations: on Postgres inside
   `pg_advisory_lock(<constant>)` released in a `finally`; on PGlite without a lock. Run as a script,
   it migrates the configured database and exits. *B03-AC-2, B03-AC-5.*
3. Boot and `createTestDb` apply the migrations; `SCHEMA_DDL` is removed. *B03-AC-4.*
4. The backend image ships `backend/drizzle/`; `deploy/migrate-job.yaml` runs the compiled migrate
   script with the backend image; `DEPLOY.md` gives the order migrate Job → seed Job → rollout and
   drops the "main gap" text. *B03-AC-6.*

## Gate

- **B03-AC-1** — `npm run db:generate -w @bosanski/backend` exits 0 and generates nothing new: the migrations match `schema.ts`. *Verify:* run it, then `git status --porcelain backend/drizzle` prints nothing.
- **B03-AC-2** — `PGLITE_PATH=$(mktemp -d) npm run db:migrate -w @bosanski/backend` exits 0 and creates every table in `schema.ts`; a second run on the same path exits 0 and applies nothing. *Verify:* the commands, plus a vitest test of the exported migration function on a file-backed PGlite.
- **B03-AC-3** — On a database created by the old `SCHEMA_DDL` and holding rows, the migrations apply without error and keep the rows. *Verify:* a vitest test that applies the old DDL fixture, inserts a user, migrates, and reads the user back.
- **B03-AC-4** — The server boot and `createTestDb` apply the migrations and no `SCHEMA_DDL` remains in `backend/src`. *Verify:* `! grep -rn SCHEMA_DDL backend/src` exits 0 and the full backend suite passes.
- **B03-AC-5** — On Postgres, the migration function takes `pg_advisory_lock` before the first migration statement and calls `pg_advisory_unlock` after the last, also when a migration throws. *Verify:* a vitest test that drives the function with a recording fake SQL client, once succeeding and once throwing.
- **B03-AC-6** — `deploy/migrate-job.yaml` parses and runs the compiled migrate script with the backend image, and `DEPLOY.md` gives the order migrate Job, seed Job, rollout and no longer calls the migration plumbing a gap. *Verify:* a `python3` PyYAML check of the Job's command, `grep -n "migrate-job" DEPLOY.md`, and `! grep -n "main gap" DEPLOY.md`.

## Risks

- OD8: if the owner prefers the Job alone (no migrations at boot), AC-4 changes for non-local mode.
- B02 (`family_id`) and T01 (`room_name` unique index) change the schema. Whichever merges after this
  node adds a migration instead of editing `ddl.ts`; whichever merges before is in the initial one.
- Real Postgres is not tested here (principle 4); the advisory lock is checked with a fake client.
  Record that in the PR.
- The Docker image and the Job must find `backend/drizzle/` at run time; the release build is the
  evidence.
