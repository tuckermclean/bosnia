# B01 — backend-package

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | R01 | B02, B11 | S |

**Owns:** `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/README.md`

## Purpose

Imported from the code. The `@bosanski/backend` workspace package (private, ESM, version 0.1.0).

- `backend/package.json` defines the scripts `dev` (`tsx watch src/index.ts`), `start` (`node dist/index.js`), `build`
  (`tsc -p tsconfig.json`), `typecheck` (the same with `--noEmit`), `test` (`vitest run`), `test:watch`, `db:generate`
  (`drizzle-kit generate`), `db:migrate` (`tsx src/db/migrate.ts`), `seed` (`tsx scripts/seed-course.ts`) and
  `smoke:groq` (`tsx scripts/smoke-groq.ts`). Its runtime dependencies are Fastify 5 with `@fastify/cors`,
  `@fastify/helmet` and `@fastify/multipart`, `drizzle-orm` over `@electric-sql/pglite` and `postgres`,
  `@node-rs/argon2`, `jsonwebtoken`, `groq-sdk`, `livekit-server-sdk` and zod 4; its dev dependencies add
  `@types/jsonwebtoken`, `@types/node`, `drizzle-kit`, `form-data` (for the multipart tests), `tsx`, TypeScript and
  vitest. The ranges are caret ranges; the root lockfile (R01) pins the versions.
- `backend/tsconfig.json` extends `../tsconfig.base.json` (R01) with `outDir` `dist`, `rootDir` `.` and the
  `node` types, and includes `src`, `scripts`, `test` and `drizzle.config.ts`.
- `backend/vitest.config.ts` runs `test/**/*.test.ts` in the node environment with globals on and 30-second
  test and hook timeouts, because a PGlite cold start can take seconds on a slow CI machine.
- `backend/README.md` documents running, building, testing, the environment variables, the JWT boot guard,
  seeding, the Docker image and the deploy path.

## Tests

No test reads these files. Every backend test runs through them: the gate's `npm test -w @bosanski/backend`
runs the `test` script with this vitest config, and CI's `npm run typecheck -w @bosanski/backend` compiles
under this tsconfig (not a test).

## Changes

none: imported

## Gate

- **B01-AC-1** — `npm test -w @bosanski/backend` runs vitest over `backend/test/**/*.test.ts` with 30-second test and hook timeouts. *Verify:* unpinned (every backend test runs through it; no test reads the config).
- **B01-AC-2** — `npm run typecheck -w @bosanski/backend` compiles `src`, `scripts` and `test` under the strict base options without emitting. *Verify:* unpinned (CI's typecheck step, not a test).
- **B01-AC-3** — The `seed` and `smoke:groq` scripts run `scripts/seed-course.ts` and `scripts/smoke-groq.ts` with `tsx`, and `dev` runs `src/index.ts` in watch mode. *Verify:* unpinned.
- **B01-AC-4** — `build` compiles with `rootDir` `.`, so the server entrypoint lands at `dist/src/index.js` and the seed script at `dist/scripts/seed-course.js`. *Verify:* unpinned.

## Risks

- `start` and `main` point at `dist/index.js`, but the build writes `dist/src/index.js` (`rootDir` is `.`), so
  `npm start -w @bosanski/backend` fails on a missing file. The README's comment on that line says
  `node dist/src/index.js`; the Dockerfile (B11) runs the right path.
- `db:migrate` runs `src/db/migrate.ts`, which does not exist (`SPEC.md`, known gaps; OD5). `db:generate` runs
  `drizzle-kit generate` with no `drizzle.config.ts`, which the tsconfig includes but the repository lacks.
- The README says the AI-backed routes "degrade gracefully without keys"; a missing Groq or LiveKit key gives a
  500 (`SPEC.md`, known gaps; principle 7).
- `build` also compiles `test/` into `dist/`.
- A dependency bump here changes the root `package-lock.json` (R01) too (`SPEC.md`, priority 2).
