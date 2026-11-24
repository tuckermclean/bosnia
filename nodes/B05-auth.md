# B05 — auth

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B02, B03, B04 | A03, B07, B08, B09, B10, B16 | M |

**Owns:** `backend/src/services/auth.ts`, `backend/src/http.ts`, `backend/src/routes/auth.ts`, `backend/test/auth.test.ts`

## Purpose

Imported from the code. Accounts, tokens, and the request guard every other route uses.

- `backend/src/services/auth.ts`: Argon2 password hashing and verification; `signAccessToken(userId)`, an HS256
  JWT `{sub, type: "access"}` under `JWT_ACCESS_SECRET` that expires in 15 minutes; `issueRefreshToken(userId)`,
  a JWT `{sub, type: "refresh", jti}` under `JWT_REFRESH_SECRET` that expires in 30 days, returned with its
  `jti`, its SHA-256 hash and its expiry; `verifyAccessToken` and `verifyRefreshToken`, which accept HS256 only
  and reject a token of the other type; `sha256`.
- `backend/src/http.ts`: `HttpError(statusCode, message)`, which the app's error handler (B10) answers as
  `{ error: message }` with that status; `requireAuth`, a pre-handler that answers 401 without a `Bearer`
  header or with a token `verifyAccessToken` rejects, and otherwise puts the user id on the request;
  `userIdOf(request)`, which reads it back.
- `backend/src/routes/auth.ts`:
  - `POST /api/auth/register` `{email, password}` (a valid email, a password of 8 to 256 characters, else
    400) answers 409 for an email already registered; otherwise creates the user and their `user_stats` row
    and returns `{ user: {id, email}, accessToken, refreshToken }`, storing the refresh token's hash under
    its `jti`.
  - `POST /api/auth/login` returns the same shape for a matching password, else 401 "Invalid email or
    password"; for an unknown email it first verifies against a dummy Argon2 hash, so the failure takes as
    long as a wrong password.
  - `POST /api/auth/refresh` `{refreshToken}` answers 401 for a token that fails verification, or whose stored
    row is missing, revoked, expired or holds another hash; otherwise it revokes that row and returns a new
    `{accessToken, refreshToken}` (rotation).
  - `GET /api/auth/me` (authenticated) returns `{ user: {id, email} }`, or 404 when the user is gone.

## Tests

`backend/test/auth.test.ts`: register, login, refresh rotation with reuse refused, `/me`; `/me` without a
token; a duplicate email; a wrong password; an unknown email; a password over 256 characters. The other
route tests over HTTP register through these routes and call with the access token.

## Changes

none: imported

## Gate

- **B05-AC-1** — Register answers 200 with the user's email, login returns an access token and a refresh token, and the access token issued by refresh opens `GET /api/auth/me`, which returns the user's email. *Verify:* `backend/test/auth.test.ts` ("registers, logs in, rotates refresh tokens, and fetches /me").
- **B05-AC-2** — `POST /api/auth/refresh` returns a new refresh token, and the used one is refused with 401 afterwards. *Verify:* `backend/test/auth.test.ts` ("registers, logs in, rotates refresh tokens, and fetches /me").
- **B05-AC-3** — A request to an authenticated route without a bearer token is answered 401. *Verify:* `backend/test/auth.test.ts` ("rejects /me without a bearer token"), `backend/test/tutor.test.ts` ("rejects tutor session requests without auth").
- **B05-AC-4** — Registering an email a second time is answered 409. *Verify:* `backend/test/auth.test.ts` ("rejects registering the same email twice with 409").
- **B05-AC-5** — Login with a wrong password, or for an email never registered, is answered 401. *Verify:* `backend/test/auth.test.ts` ("rejects login with a wrong password with 401"), `backend/test/auth.test.ts` ("rejects login for an email that was never registered with 401 (same code path as wrong password)").
- **B05-AC-6** — A password longer than 256 characters is answered 400. *Verify:* `backend/test/auth.test.ts` ("rejects passwords longer than 256 characters").
- **B05-AC-7** — Access tokens expire after 15 minutes and refresh tokens after 30 days; a refresh token is not accepted as an access token, nor the reverse. *Verify:* unpinned.
- **B05-AC-8** — Login for an unknown email runs an Argon2 verification before answering 401, so its timing matches a wrong password. *Verify:* `backend/test/auth.test.ts` ("B05-AC-8: unknown email runs one Argon2 verify before answering 401").

## Risks

- Emails are stored and compared as given: `A@x.com` and `a@x.com` register as two accounts.
- Register checks for the email, then inserts: two concurrent registrations of one email hit the unique index
  and the second gets a 500, not a 409.
- Refresh looks the row up, then revokes it, outside a transaction: two concurrent uses of one refresh token can
  both succeed. A reused token is refused but does not revoke the rest of the family (no reuse detection;
  `FOLLOWUPS.md`, priority 4).
- No rate limit on register, login or refresh (OD3, priority 4). Logout does not exist; a refresh token lives
  until it is used or expires (30 days), which matters for the web token storage of OD1.
- `requireAuth` checks the token only: an access token of a deleted user passes until it expires.
