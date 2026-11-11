# W02 — cors-allowlist

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | S |

**Owns:** `backend/src/app.ts`, `backend/src/env.ts`, `backend/src/index.ts` (passing the setting), `.env.example`, `backend/README.md` (CORS section), `deploy/backend-deployment.yaml`, `deploy/backend-secret.example.yaml`

## Purpose

`backend/src/app.ts` registers `@fastify/cors` with `origin: true`, which reflects any origin; the
live probe saw `Origin: https://evil.example` reflected (`docs/AUDIT.md`, A13; FOLLOWUPS #15). With a
web client this matters now. The allowlist and its defaults are OD5: `CORS_ORIGINS`, comma-separated
exact origins; unset in local mode allows `http://localhost:8081` (the Expo web dev server); unset
otherwise allows no cross-origin access, since W03 serves the web build on the backend's origin.

## Tests

Add vitest tests using `app.inject` with an `Origin` header, building the app with an explicit
allowlist. Red target: `npm test -w @bosanski/backend -- test/cors.test.ts`.

## Changes

1. `env.ts`: parse `CORS_ORIGINS` into a list of trimmed origins, applying the OD5 defaults.
   *W02-AC-4.*
2. `buildApp` takes the allowlist (default from `env`) and registers `@fastify/cors` with it,
   allowing the `Authorization` and `Content-Type` request headers. *W02-AC-1, W02-AC-2,
   W02-AC-3.*
3. Document `CORS_ORIGINS` in `.env.example`, `backend/README.md` and the k8s secret example (empty
   for same-origin hosting). *W02-AC-5.*

## Gate

- **W02-AC-1** — With the allowlist `https://a.example,https://b.example`, a request with `Origin: https://a.example` gets `Access-Control-Allow-Origin: https://a.example`, and a preflight `OPTIONS /api/auth/login` from that origin requesting `authorization, content-type` succeeds and allows both headers. *Verify:* vitest tests with `app.inject`.
- **W02-AC-2** — With the same allowlist, a request with `Origin: https://evil.example` gets no `Access-Control-Allow-Origin` header. *Verify:* a vitest test with `app.inject`.
- **W02-AC-3** — A request with no `Origin` header (native client, curl) behaves as before: `GET /health` answers 200. *Verify:* a vitest test with `app.inject`.
- **W02-AC-4** — With `CORS_ORIGINS` unset, local mode (no `DATABASE_URL`) allows `http://localhost:8081` and nothing else, and non-local mode allows no origin. *Verify:* vitest tests of the parsed setting for both modes.
- **W02-AC-5** — `CORS_ORIGINS` is documented in `.env.example`, `backend/README.md` and `deploy/backend-secret.example.yaml`. *Verify:* `grep -q CORS_ORIGINS .env.example && grep -q CORS_ORIGINS backend/README.md && grep -q CORS_ORIGINS deploy/backend-secret.example.yaml` exits 0.

## Risks

- `env.ts` parses `process.env` at import time; tests should pass the allowlist to `buildApp`
  rather than mutate the environment.
- `helmet`'s default `Cross-Origin-Resource-Policy: same-origin` does not block CORS requests, but
  check a cross-origin `fetch` from the dev server once by hand.
- `backend/src/app.ts` is also changed by B02 (rate limiting); merge carefully.
