# B16 — request-errors-4xx

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | B05, B08, B10 | none | S |

**Owns:** `backend/test/request-errors.test.ts`
**Resolves:** #30

## Purpose

Some requests the client gets wrong are answered 500 `{"error":"Internal server error"}` instead of a 4xx.

- The error handler in `backend/src/app.ts` (B10) answers an `HttpError` (B05) with its status and a zod error
  with 400. Every other error gets 500, including the request errors that Fastify and its plugins raise with a
  4xx `statusCode` of their own:
  - a malformed JSON body (for example on `POST /api/auth/login`) is a parser error with `statusCode` 400;
  - a body whose content type has no parser (for example `application/xml`) is Fastify's
    `FST_ERR_CTP_INVALID_MEDIA_TYPE`, with `statusCode` 415;
  - a `POST /api/pronunciation` (B08) that is not multipart makes `request.parts()` throw
    `@fastify/multipart`'s `FST_INVALID_MULTIPART_CONTENT_TYPE` ("the request is not multipart"), with
    `statusCode` 406.
- `POST /api/auth/register` (B05) looks up the email, then inserts the user. If two registrations of one email
  run at once, both lookups find nothing. The second insert then fails on the unique index on `users.email`
  (SQLSTATE `23505`) and is answered 500, where a sequential duplicate is answered 409.

With this node, the error handler answers an error that carries a `statusCode` from 400 to 499 with that
status. The body is `{"error": <the status's standard reason phrase>}`, for example `Bad Request`,
`Unsupported Media Type` or `Not Acceptable`, as `node:http`'s `STATUS_CODES` gives it, or `Bad Request` when
the status has none. That message is short and fixed, so the body carries neither the parser's message nor
anything the client sent. Register answers a unique violation of its user insert with the same 409
`{"error":"Email already registered"}` as the lookup. The handler's other branches are unchanged: an
`HttpError` gets its own status and message, a zod error gets 400 `Validation error` with its issues, and every
other error, including one that carries a 5xx `statusCode`, gets 500 `{"error":"Internal server error"}`
without its message (B10-AC-5).

## Tests

`backend/test/request-errors.test.ts` (vitest, PGlite through `createTestDb`, the fakes of
`backend/test/helpers.ts`, no key, no network). Each case builds the app with `buildApp`. The cases that need a
login register a user over HTTP for the bearer token, as the route tests of B05 and B08 do.

- **Malformed JSON.** `POST /api/auth/login` with `content-type: application/json` and the body `{"email":` is
  answered 400 `{"error":"Bad Request"}`. The body contains neither `JSON` nor `Unexpected`.
- **Unsupported content type.** `POST /api/auth/login` with `content-type: application/xml` and an XML body is
  answered 415 `{"error":"Unsupported Media Type"}`, and the body does not contain `xml`.
- **Not multipart.** A logged-in `POST /api/pronunciation` with a JSON body `{"targetPhrase":"dobar dan"}` is
  answered 406 `{"error":"Not Acceptable"}`. The fake transcriber is not called and no
  `pronunciation_attempts` row is saved.
- **Concurrent sign-up.** Two `POST /api/auth/register` requests for one email, started together
  (`Promise.all` of two `app.inject` calls), are answered 200 and 409, in either order. The 409's body is
  `{"error":"Email already registered"}`, and afterwards the database holds one `users` row for the email and
  one `user_stats` row for that user. The Argon2 hash between each request's lookup and its insert takes far
  longer than a PGlite query, so both lookups run before either insert. The RED run must show the second
  request answered 500, which proves the test reaches the race.
- **Other errors stay 500.** With a transcriber fake that throws `Error("transcriber exploded")`, a valid
  multipart upload (an `audio/wav` file and a target phrase) is answered 500
  `{"error":"Internal server error"}`, and the body does not contain `exploded`. With a fake that throws an
  `Error` carrying `statusCode` 502, the same upload is also answered 500 `{"error":"Internal server error"}`.

Today the first four cases fail: each is answered 500. The last case passes and must keep passing.

## Changes

- `backend/src/app.ts`: the error handler gets a branch after the `HttpError` and zod branches and before the
  500. An error whose numeric `statusCode` is from 400 to 499 is answered with that status and
  `{ error: STATUS_CODES[status] ?? "Bad Request" }`, without logging it as a server error. The other branches
  stay as they are.
- `backend/src/routes/auth.ts`: register wraps its `users` insert. A unique violation (SQLSTATE `23505`, on the
  thrown error or its `cause`, since drizzle wraps the driver's error) becomes
  `HttpError(409, "Email already registered")`. Any other error is rethrown unchanged. The lookup before the
  insert stays, so a sequential duplicate is still refused without hashing the password.
- `backend/test/request-errors.test.ts`: new, the cases above.

## Gate

- **B16-AC-1** — A malformed JSON body to `POST /api/auth/login` is answered 400 `{"error":"Bad Request"}`, and the body carries no parser message. *Verify:* `npm test -w @bosanski/backend -- test/request-errors.test.ts`.
- **B16-AC-2** — A body of an unsupported content type to `POST /api/auth/login` is answered 415 `{"error":"Unsupported Media Type"}`, and the body does not echo the content type. *Verify:* `npm test -w @bosanski/backend -- test/request-errors.test.ts`.
- **B16-AC-3** — A logged-in `POST /api/pronunciation` that is not multipart is answered 406 `{"error":"Not Acceptable"}`, the status the multipart plugin's error carries, and no attempt is saved. *Verify:* `npm test -w @bosanski/backend -- test/request-errors.test.ts`.
- **B16-AC-4** — Two concurrent registrations of one email are answered 200 and 409 `{"error":"Email already registered"}`, and leave one `users` row and one `user_stats` row. The RED run shows the 500 the race gave before the change. *Verify:* `npm test -w @bosanski/backend -- test/request-errors.test.ts`, and the RED evidence in the node's PR.
- **B16-AC-5** — An error that carries no `statusCode`, or a 5xx one, is still answered 500 `{"error":"Internal server error"}` without its message. *Verify:* `npm test -w @bosanski/backend -- test/request-errors.test.ts`.
- **B16-AC-6** — Only a unique violation of register's user insert is turned into 409. Any other error of that insert is rethrown, and the handler's `HttpError` and zod branches answer as before. *Verify:* the reviewer reads `backend/src/routes/auth.ts` and `backend/src/app.ts`, and `npm test -w @bosanski/backend -- test/auth.test.ts test/pronunciation.test.ts` passes.
- **B16-AC-7** — The backend suite and `npm run typecheck -w @bosanski/backend` pass. *Verify:* `npm test -w @bosanski/backend`, and CI's backend job runs the typecheck.

## Risks

- The 4xx branch trusts any error's `statusCode`, not only Fastify's. If a library error inside a route (the
  Groq or LiveKit client, say) ever carried a 4xx `statusCode`, the client would get that 4xx and its reason
  phrase instead of a 500. The Groq SDK names its field `status`, not `statusCode`, so it is not affected
  today.
- 406 is the multipart plugin's own status for "the request is not multipart". A 415 would fit the case better,
  but this node passes the plugin's status through rather than special-casing it. A later plugin version could
  change the status, and B16-AC-3's test would then fail and name the new one.
- The reason phrase replaces Fastify's message, so a client cannot tell a malformed body from an empty one;
  both are `Bad Request`.
- The concurrent sign-up test relies on the Argon2 hash keeping both lookups ahead of both inserts. B16-AC-4's
  RED evidence shows that the test reached the race, but a much faster hash could stop it from doing so.
- The open spec PR for issue #29 (B15, missing-key-503) also changes the error handler in `backend/src/app.ts`,
  adding a 503 branch before the 500. Whichever node is built second keeps the other's branch. B16's 4xx branch
  and B15's 503 branch match different errors, and both leave the final 500 in place.
- This node supersedes the Risks of B05, B08 and B10 that record these 500s; those imported specs are history
  and stay as written.
