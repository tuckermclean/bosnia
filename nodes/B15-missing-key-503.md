# B15 — missing-key-503

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | B04, B08, B09, B10 | none | S |

**Owns:** `backend/src/unavailable.ts`, `backend/test/missing-keys.test.ts`, `backend/test/dep-pins.test.ts`
**Resolves:** #29

## Purpose

Principle 7 says a missing key fails clearly: the backend answers a 503 that names the feature, not the
variable, and its server log names the missing key. Today neither holds.

- `GROQ_API_KEY` and the three LiveKit settings (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) default
  to empty strings (B02), and `backend/src/index.ts` (B10) builds the real Groq transcriber and LiveKit minter
  (B04) with them anyway, so the failure shows only on a route's first use. `POST /api/pronunciation` (B08) then
  fails inside the Groq call and `POST /api/tutor/session` (B09) inside the minter, and the error handler of
  `backend/src/app.ts` (B10) answers both 500 `{"error":"Internal server error"}`.
- `buildApp` creates Fastify with its logger off, so the error handler's `app.log.error` and the "listening"
  line write nothing: no server log names the missing key, or the cause of any 500.

This node makes each adapter check its settings when it is called, not when it is built (the server still boots
without them, and the rest of the API keeps working), and throw a `FeatureUnavailableError` that carries the
feature and the names of the missing settings, before any call to Groq or LiveKit. The error handler answers
that error 503 `{"error":"<feature> is unavailable"}` and logs one line at level `error` that names each missing
setting. The server process logs at level `info` with Fastify's per-request lines off, so a deployed pod's log
holds the boot line, the missing-setting lines and the cause of each 500, and no request noise. Tests build the
app with a log of their own and stay quiet otherwise.

The features are named as the learner sees them: `pronunciation` (`pronunciation is unavailable`) and
`voice tutor` (`voice tutor is unavailable`).

## Tests

`backend/test/missing-keys.test.ts` (vitest, PGlite through `createTestDb`, no key, no network). Each case builds
the app with `buildApp(deps, { logger })`, where `logger` is `SERVER_LOGGER` (the options `index.ts` uses) with a
`stream` added that collects every line the app writes, parsed as JSON. A user is registered over HTTP for the
bearer token, as the route tests of B08 and B09 do.

- **Pronunciation.** With the real `createGroqTranscriber("")`, a valid multipart upload (an `audio/wav` file
  and a target phrase) to `POST /api/pronunciation` is answered 503 `{"error":"pronunciation is unavailable"}`;
  the body does not contain `GROQ_API_KEY`; no `pronunciation_attempts` row is saved; the log holds exactly one
  line at level 50 (`error`) whose `msg` contains `GROQ_API_KEY`. A key of only spaces counts as missing.
- **Tutor.** With the real `createLiveKitMinter("", "", "")`, `POST /api/tutor/session` (with and without a
  level) is answered 503 `{"error":"voice tutor is unavailable"}`; the body names no `LIVEKIT_` variable; no
  `tutor_sessions` row is saved; one error line's `msg` names `LIVEKIT_URL`, `LIVEKIT_API_KEY` and
  `LIVEKIT_API_SECRET`. With the URL and the key set to sentinel values and only the secret empty, the line names
  `LIVEKIT_API_SECRET` and neither of the other two names nor the sentinel values.
- **The adapters.** `createGroqTranscriber("").transcribe(...)` and `createLiveKitMinter("", "", "").mint(...)`
  reject with a `FeatureUnavailableError` whose feature and missing settings are the ones above; building them
  throws nothing.
- **Other errors.** With a transcriber fake that throws `Error("transcriber exploded")`, the upload is still
  answered 500 `{"error":"Internal server error"}` (B10-AC-5), and the log holds an error line that carries
  `transcriber exploded`.
- **Request noise.** A successful `GET /health`, register and login write no log line.
- **No secrets.** Over a register, a login, a refresh, a tutor session with `fakeMinter({ token: <sentinel> })`
  and the 503 cases above, no collected line contains the password, the access or refresh token, the minted
  token, or any sentinel setting value.
- **Quiet by default.** `buildApp(deps)` without options writes nothing to stdout (the existing route tests
  build it that way and stay as they are).

## Changes

- `backend/src/unavailable.ts`: new. `FeatureUnavailableError` (an `Error` with `feature`, `missingKeys` and the
  message `<feature> is unavailable`) and `missingSettings(settings)`, which returns, in order, the names whose
  values are empty after trimming.
- `backend/src/services/groq.ts`: `createGroqTranscriber`'s `transcribe` throws
  `FeatureUnavailableError("pronunciation", ["GROQ_API_KEY"])` when the key is missing, before the Groq client is
  used. With a key, nothing changes.
- `backend/src/services/livekit.ts`: `createLiveKitMinter`'s `mint` throws
  `FeatureUnavailableError("voice tutor", <the missing LiveKit settings>)` when any of the three is missing, before
  the room service or the access token is used. With all three, nothing changes.
- `backend/src/app.ts`: `buildApp(deps, options?)` takes an optional `logger`, passed to Fastify as its `logger`
  option (default `false`, as today), and sets Fastify's `disableRequestLogging`. It exports `SERVER_LOGGER`
  (`{ level: "info" }`). The error handler answers a `FeatureUnavailableError` 503 `{ error: <its message> }` and
  logs `<feature> is unavailable: <names> not set` at level `error`; its other branches answer as today, and the
  500 branch logs the error.
- `backend/src/index.ts`: builds the app with `{ logger: SERVER_LOGGER }`. Its boot and failure handling do not
  change.
- `backend/test/missing-keys.test.ts`: new, the cases above.

## Gate

- **B15-AC-1** — Without `GROQ_API_KEY` (empty or only spaces), a valid upload to `POST /api/pronunciation` is answered 503 `{"error":"pronunciation is unavailable"}`, whose body does not name the variable, and no attempt is saved. *Verify:* `npm test -w @bosanski/backend -- test/missing-keys.test.ts`.
- **B15-AC-2** — Without any of `LIVEKIT_URL`, `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET`, `POST /api/tutor/session` is answered 503 `{"error":"voice tutor is unavailable"}`, whose body names no `LIVEKIT_` variable, and no session is saved. *Verify:* `npm test -w @bosanski/backend -- test/missing-keys.test.ts`.
- **B15-AC-3** — Each such 503 writes one log line at level `error` that names every missing setting of that feature and no setting that is present. *Verify:* `npm test -w @bosanski/backend -- test/missing-keys.test.ts`.
- **B15-AC-4** — The real Groq transcriber and LiveKit minter build without their settings and reject a call with a `FeatureUnavailableError` naming the feature and the missing settings, before any call to Groq or LiveKit. *Verify:* `npm test -w @bosanski/backend -- test/missing-keys.test.ts`, and the reviewer reads `backend/src/services/groq.ts` and `backend/src/services/livekit.ts` for the check's place.
- **B15-AC-5** — Any other error is still answered 500 `{"error":"Internal server error"}`, and its cause is written to the log at level `error`. *Verify:* `npm test -w @bosanski/backend -- test/missing-keys.test.ts`.
- **B15-AC-6** — The server process builds the app with logging on at level `info` and Fastify's per-request lines off: a successful request writes no log line. *Verify:* `npm test -w @bosanski/backend -- test/missing-keys.test.ts`, and the reviewer reads `backend/src/index.ts` for `SERVER_LOGGER`.
- **B15-AC-7** — No log line contains a password, an access or refresh token, a minted LiveKit token or the value of a setting. *Verify:* `npm test -w @bosanski/backend -- test/missing-keys.test.ts`.
- **B15-AC-8** — `buildApp(deps)` without options logs nothing, and the backend suite and `npm run typecheck -w @bosanski/backend` pass. *Verify:* `npm test -w @bosanski/backend`, and CI's backend job runs the typecheck.

## Risks

- This node supersedes what the Risks of B08, B09 and B10 record about the 500 and the logger, and what B10's
  Purpose says about the logger being off; those imported specs are history and stay as written. B10-AC-5 still
  holds for every error that is not a `FeatureUnavailableError`.
- Only the two keyed routes are checked when they are called. Nothing warns at boot, so a pod with a missing key
  looks healthy until a learner uses the feature; the first use's log line names the key.
- A set but wrong key (revoked, mistyped) is not a missing key: Groq or LiveKit refuses it and the route still
  answers 500, with the cause now in the log.
- Pino writes JSON lines to stdout; the level is fixed at `info`, with no setting to change it.
- The error handler logs a 500's error object with its stack. An error thrown by a library could carry request
  data in its own fields; the tests pin the cases above, not every library's errors.
- `backend/scripts/smoke-groq.ts` (B04) still skips and exits 0 without `GROQ_API_KEY`; principle 7's rule for
  scripts is not this node's work.
