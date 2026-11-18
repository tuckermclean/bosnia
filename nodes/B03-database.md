# B03 — database

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B02 | B04, B05, B06, B07, B08, B09, B10 | M |

**Owns:** `backend/src/db/schema.ts`, `backend/src/db/ddl.ts`, `backend/src/db/client.ts`

## Purpose

Imported from the code. The database schema and the handle to it.

- `backend/src/db/schema.ts` declares the Drizzle tables: content (`courses`, `units`, `skills`, `lessons`, `exercises`,
  with `review_status` defaulting to `unreviewed` on skills and exercises and the exercise `payload` as jsonb), users
  and auth (`users` with a unique `email`, `refresh_tokens` keyed by the token's `jti`), progress (`user_stats` with xp,
  streak, hearts defaulting to 5, `hearts_updated_at` and `last_active`; `user_skill_progress` keyed by user and skill,
  with `crown_level` and `unlocked`; `lesson_attempts`), and the AI features (`pronunciation_attempts` with `per_word`
  as jsonb, `tutor_sessions` with a nullable CEFR `level`, `tutor_turns`). It exports the types `ExerciseType` (the five
  exercise types), `ReviewStatus`, `ExercisePayload` and `PerWordScore`.
- `backend/src/db/ddl.ts` holds `SCHEMA_DDL`, the same tables as `CREATE TABLE IF NOT EXISTS` statements, kept
  in sync with `schema.ts` by hand.
- `backend/src/db/client.ts`: `createDbHandle()` opens PGlite when `isLocalDb` (B02), file-backed at
  `PGLITE_PATH` when set and in memory otherwise, else a `postgres` pool of 10 on `DATABASE_URL`; its
  `initSchema()` runs `SCHEMA_DDL` and `close()` closes the client. `createTestDb()` returns a fresh in-memory
  PGlite with the schema applied, for tests. The `Db` type covers both drivers.

## Tests

No test of its own. Every backend test that touches the database opens it with `createTestDb()` and writes
and reads the tables through Drizzle, so a column the routes use that `SCHEMA_DDL` lacks fails those tests.
No test covers the Postgres branch, `PGLITE_PATH`, or that `ddl.ts` and `schema.ts` agree column for column.

## Changes

none: imported

## Gate

- **B03-AC-1** — `createTestDb()` gives each test a fresh, isolated database. *Verify:* `backend/test/progress.test.ts` (each test opens its own database and registers the same email again).
- **B03-AC-2** — A new user's `user_stats` row starts at 5 hearts and 0 xp (the table's defaults). *Verify:* `backend/test/progress.test.ts` ("updates xp/streak/hearts and persists a lesson attempt").
- **B03-AC-3** — `initSchema()` is safe to run on a database that already has the tables (every statement is `IF NOT EXISTS`). *Verify:* unpinned.
- **B03-AC-4** — With `DATABASE_URL` set, `createDbHandle()` connects to Postgres; without it, to PGlite, on disk at `PGLITE_PATH` when set and in memory otherwise. *Verify:* unpinned.
- **B03-AC-5** — Skills and exercises default to `review_status` `unreviewed`. *Verify:* unpinned.

## Risks

- `SCHEMA_DDL` and `schema.ts` are kept in sync by hand. `initSchema()` creates missing tables only: a column
  added later never reaches an existing database, and there are no migrations (OD5; `SPEC.md`, known gaps).
- Two replicas that boot at once both run `SCHEMA_DDL` against the same Postgres with no lock (OD5).
- `email` is unique as stored, case-sensitive: `A@x.com` and `a@x.com` are two accounts (B05).
- `tutor_turns` and `tutor_sessions.ended_at` and `duration_sec` exist but nothing writes them yet
  (`FOLLOWUPS.md`; OD6).
- The `Db` type is the intersection of both drivers' types, cast with `as unknown as Db`; a call one driver
  lacks type-checks and fails only at run time.
