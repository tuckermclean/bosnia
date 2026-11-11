# B02 — auth-hardening

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | M |

**Owns:** `backend/src/routes/auth.ts`, `backend/src/services/auth.ts`, `backend/src/db/schema.ts`, `backend/src/db/ddl.ts`, `backend/src/app.ts` (rate-limit registration), `backend/src/env.ts` (`TRUST_PROXY`), `backend/package.json`, `package-lock.json`, `app/src/state/authStore.ts`, `app/src/api/auth.ts`, `deploy/backend-deployment.yaml` (`TRUST_PROXY`), `backend/README.md` (auth section), `FOLLOWUPS.md` (#12 and rate limiting entries)

## Purpose

From `docs/AUDIT.md` (A12, A19, section 3) and FOLLOWUPS #12:

- Refresh rotation reads the token, checks it, then revokes it with an unconditional `UPDATE`, outside
  a transaction; two concurrent refreshes with one token can both succeed on pooled Postgres.
- There is no token family: replaying a revoked refresh token is refused, but the child it produced
  stays valid.
- Logout only deletes tokens on the client; the server-side refresh token stays valid for 30 days.
- Auth routes have no rate limit (30 bad logins all answered 401).

With a public web client these are `now`. Rate limits and proxy trust follow OD6.

## Tests

Add vitest tests in `backend/test/` and a jest test for the app's logout. Red target, e.g.
`npm test -w @bosanski/backend -- test/auth-hardening.test.ts`.

## Changes

1. Add a `family_id` to refresh tokens (schema and DDL, with an `ALTER TABLE … ADD COLUMN IF NOT
   EXISTS` so existing databases get it; existing rows count as their own family). Login and register
   start a family; refresh issues the child in the same family. *B02-AC-2.*
2. Refresh revokes the presented token with a conditional update (`revoked = false` in the `WHERE`)
   and issues a new pair only if exactly one row changed. *B02-AC-1.*
3. Presenting a revoked token revokes its whole family. *B02-AC-2.*
4. `POST /api/auth/logout` with `{ refreshToken }` revokes that token's family. *B02-AC-3.*
5. The app's `logout` calls it with the stored refresh token, then clears tokens whatever the
   outcome. *B02-AC-4.*
6. Register `@fastify/rate-limit` (pinned) on the auth routes with OD6's limits; `TRUST_PROXY=true`
   enables Fastify's `trustProxy`; the k8s deployment sets it. *B02-AC-5, B02-AC-6.*

## Gate

- **B02-AC-1** — A refresh whose token is revoked between its lookup and its revocation answers 401 and issues no new token. *Verify:* a vitest test that wraps the test database so the token is revoked right after the lookup query, then expects 401 and no new `refresh_tokens` row.
- **B02-AC-2** — After a refresh token A is rotated to B, presenting A again answers 401 and revokes B: refreshing with B then answers 401. *Verify:* a vitest test of the replay sequence.
- **B02-AC-3** — `POST /api/auth/logout` with a valid refresh token answers 204 and revokes its family, so refreshing with that token or its descendants answers 401; a malformed, unknown or already revoked token also answers 204. *Verify:* vitest tests.
- **B02-AC-4** — The app's `logout` posts the stored refresh token to `/api/auth/logout`, then clears the stored tokens and sets the state to unauthenticated, also when that request fails. *Verify:* a jest test of `authStore` with the auth API and token storage mocked.
- **B02-AC-5** — From one client IP, the 11th `POST /api/auth/login` within a minute answers 429 with a `retry-after` header; register has the same limit, refresh allows 30; `GET /health` and the lesson routes are not limited. *Verify:* vitest tests with `app.inject`.
- **B02-AC-6** — With `TRUST_PROXY=true`, requests carrying different `X-Forwarded-For` client addresses are limited separately; without it, `X-Forwarded-For` is ignored. *Verify:* vitest tests with `app.inject` and the `x-forwarded-for` header.

## Risks

- OD6: the numbers are a default; the owner may change them before the build.
- `ddl.ts` is replaced by migrations in B03. If B03 merges first, the `family_id` change is a new
  migration instead of a DDL edit.
- `app.inject` sets the remote address to `127.0.0.1`; tests for AC-5 must not leak counts into
  other test files (build a fresh app per test).
- `backend/src/app.ts` is also changed by W02.
