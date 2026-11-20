# B10 — api-server

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B02, B03, B04, B05, B06, B07, B08, B09 | A03, B11, B16, D03 | M |

**Owns:** `backend/src/app.ts`, `backend/src/index.ts`, `backend/test/integration.test.ts`

## Purpose

Imported from the code. The app that puts the routes together, and the server process.

- `backend/src/app.ts`: `buildApp(deps)` builds a Fastify app with its logger off, registers `@fastify/cors` with
  `origin: true` (any origin; OD2), `@fastify/helmet`, and `@fastify/multipart` limited to one file of at most
  `MAX_UPLOAD_BYTES` (10 MiB). Its error handler answers an `HttpError` (B05) with its status and `{error: message}`, a
  zod error with 400 `{error: "Validation error", issues}`, and anything else with 500
  `{error: "Internal server error"}`. It serves `GET /health` as `{ok: true}` and registers the auth (B05), course and
  progress (B07), pronunciation (B08) and tutor (B09) routes. The dependencies are injected (`AppDeps`, B04), so tests
  build it with a test database and fakes.
- `backend/src/index.ts` boots the server: the JWT boot guard (B02), `createDbHandle()` and `initSchema()` (B03),
  then the auto-seed (B06) when `AUTO_SEED` is `"true"`, or when it is unset and the database is local (never
  when it is `"false"`), then `buildApp` with the real Groq transcriber and LiveKit minter (B04), listening on
  `0.0.0.0:PORT`. A failure is printed and the process exits 1.

## Tests

Every route test builds the app with `buildApp`. `backend/test/integration.test.ts` seeds the committed curriculum
(`content/generated/course.json` and the audio manifest) into a fresh database with `seedCourse` (B06) and runs a new
user through the API: the course tree, the first lesson, a lesson-complete and a tutor session over HTTP. Its
pronunciation step calls `processPronunciation` (B08) directly, not `POST /api/pronunciation`. No test runs `index.ts`,
`GET /health`, CORS, or the 500 branch of the error handler.

## Changes

none: imported

## Gate

- **B10-AC-1** — Over the committed curriculum seeded into a fresh database, a registered user reads the course tree with the first skill of the first unit unlocked and that unit's other skills locked, and opens its first lesson with its six exercises. *Verify:* `backend/test/integration.test.ts` ("GET /api/courses serves the real seeded A1->B2 course with the first skill of the first unit unlocked"), `backend/test/integration.test.ts` ("GET /api/lessons/:id returns the first lesson with populated exercise payloads").
- **B10-AC-2** — On that course, completing the first lesson with 5 of 6 correct gives 50 xp, opening a tutor session saves its row, and a pronunciation attempt on the lesson's `speak` exercise, through `processPronunciation`, is scored and saved. *Verify:* `backend/test/integration.test.ts` ("POST /api/progress/lesson-complete raises xp for the real first lesson"), `backend/test/integration.test.ts` ("POST /api/tutor/session mints a token and records a real tutor_sessions row"), `backend/test/integration.test.ts` ("processPronunciation scores a real 'speak' exercise's targetPhrase and persists the attempt").
- **B10-AC-3** — A request that fails zod validation is answered 400, and an `HttpError` with its own status. *Verify:* `backend/test/auth.test.ts` ("rejects passwords longer than 256 characters"), `backend/test/auth.test.ts` ("rejects registering the same email twice with 409").
- **B10-AC-4** — `GET /health` answers `{ok: true}` without authentication. *Verify:* unpinned.
- **B10-AC-5** — Any other error is answered 500 `{error: "Internal server error"}`, without its message. *Verify:* unpinned.
- **B10-AC-6** — The server runs the boot guard before it opens the database, creates the tables, auto-seeds as `AUTO_SEED` and `isLocalDb` decide, and listens on `0.0.0.0:PORT`; a boot failure exits 1. *Verify:* unpinned.
- **B10-AC-7** — CORS accepts any origin, and helmet's security headers are set on every response. *Verify:* unpinned.

## Risks

- The logger is off, so `app.log.error` in the error handler and the "listening" line log nothing: no server log
  names a missing key (principle 7) or any 500's cause.
- Fastify's own request errors (a malformed body, an unsupported content type) fall into the error handler's
  500 branch, being neither `HttpError` nor zod errors: a malformed JSON body on login is answered 500
  `{"error":"Internal server error"}`, and so is a request to `POST /api/pronunciation` (B08) that is not
  multipart. An unknown route still gets Fastify's 404, since the not-found handler bypasses the error handler.
- CORS accepts every origin (OD2, priority 3), and `trustProxy` is off, so behind the ingress `request.ip` is the
  ingress's address (OD3).
- No handler for SIGTERM: the server neither drains requests nor closes the database on shutdown (priority 6).
- The integration test asserts the committed curriculum's content (unit `a1-u1` with five skills, lesson
  `a1-u1-s1-l1` with six exercises, among them a `speak` exercise); that data is out of scope for nodes and the
  owner's regeneration can break the test.
- The multipart limit of one 10 MiB file applies to every route, not only pronunciation.
