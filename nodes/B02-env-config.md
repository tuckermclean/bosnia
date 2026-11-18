# B02 — env-config

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B01 | B03, B04, B05, B10 | S |

**Owns:** `backend/src/env.ts`

## Purpose

Imported from the code. `backend/src/env.ts` reads the backend's settings once, at import.

- It first loads `.env` files, best effort: the repository root's, then the backend package's (the later one
  overrides), each with `process.loadEnvFile` inside a try/catch, so a missing file is ignored.
- It parses `process.env` with a zod schema into the exported `env`: `DATABASE_URL` (default empty),
  `PGLITE_PATH` (optional), `AUTO_SEED` (`"true"` or `"false"`, optional), `JWT_ACCESS_SECRET` and
  `JWT_REFRESH_SECRET` (defaults `dev-access-secret-change-me` and `dev-refresh-secret-change-me`), `PORT`
  (coerced to a number, default 3000), and `GROQ_API_KEY`, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`,
  `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` (each default empty).
- `isLocalDb` is true when `DATABASE_URL` is empty or blank: the backend then runs on PGlite (B03).
- `assertProductionSecretsAreSafe()` (the boot guard, called first by the server, B10) does nothing in local
  mode; otherwise it throws, naming the variables, when either JWT secret is empty or starts with `dev-`.

## Tests

No test imports `env.ts` directly. Every backend test loads it, through the app and the database client, with
no variable set: local mode, the default JWT secrets and no keys. No test covers the boot guard, the `.env`
loading or a non-default value.

## Changes

none: imported

## Gate

- **B02-AC-1** — With no environment variable set, `env.ts` loads and the default JWT secrets sign and verify the auth tokens. *Verify:* `backend/test/auth.test.ts` ("registers, logs in, rotates refresh tokens, and fetches /me").
- **B02-AC-2** — `isLocalDb` is true exactly when `DATABASE_URL` is empty or blank. *Verify:* unpinned.
- **B02-AC-3** — With `DATABASE_URL` set, `assertProductionSecretsAreSafe()` throws, naming `JWT_ACCESS_SECRET` and/or `JWT_REFRESH_SECRET`, when the secret is empty or starts with `dev-`; in local mode it never throws. *Verify:* unpinned.
- **B02-AC-4** — `AUTO_SEED` accepts only `"true"` or `"false"`, and `PORT` defaults to 3000. *Verify:* unpinned.
- **B02-AC-5** — The root `.env` and then `backend/.env` are loaded when present, the second overriding the first, and a missing file is ignored. *Verify:* unpinned.

## Risks

- `process.loadEnvFile` needs Node 20.12 or later; on an older Node 20 the try/catch skips the `.env` files
  silently (R01, OD9).
- The `.env` paths are relative to the module: compiled to `dist/src/env.js`, they resolve to `backend/.env` and
  `backend/dist/.env`, not the repository root's file.
- An invalid `AUTO_SEED` or `PORT` throws a zod error at import, so the server and every script that imports
  `env.ts` fail before they start.
- The keys default to empty strings, so a missing key shows only when a route first uses it, as a 500
  (`SPEC.md`, known gaps; principle 7).
- `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` are parsed but no backend code reads them; the voice agent and the
  content pipeline use Azure.
- `env` is parsed once per process, so a test cannot vary a setting without a fresh module load.
