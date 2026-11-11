# B01 — not-configured-503

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | S |

**Owns:** `backend/src/services/livekit.ts`, `backend/src/services/groq.ts`, `backend/src/routes/tutor.ts`, `backend/src/routes/pronunciation.ts`, `backend/src/http.ts` (if a shared error helps), `app/src/features/pronunciation/RecordExercise.tsx` (error text only), `backend/README.md` (no-key behaviour), `.env.example` (comment)

## Purpose

`backend/README.md` and `.env.example` say the AI routes "degrade gracefully without keys". They do
not: with no keys, `POST /api/tutor/session` and `POST /api/pronunciation` answer 500 "Internal server
error" (`docs/AUDIT.md`, B6). Principle 7: a missing key fails clearly, as 503 naming the feature.

## Tests

Add vitest tests that build the app with the real minter and transcriber constructed with empty keys
(`createLiveKitMinter("", "", "")`, `createGroqTranscriber("")`), so no network is touched. Add a jest
test for the pronunciation error text. Red target, e.g.
`npm test -w @bosanski/backend -- test/not-configured.test.ts`.

## Changes

1. The LiveKit minter knows whether its URL, key and secret are all set; when not, `mint` throws a
   not-configured error before any network call, and the tutor route answers 503 without inserting a
   session. *B01-AC-1.*
2. The Groq transcriber does the same for an empty `GROQ_API_KEY`; the pronunciation route answers
   503 without inserting an attempt. *B01-AC-2.*
3. `RecordExercise` shows a distinct message when scoring answers 503. *B01-AC-4.*
4. Replace the "degrade gracefully" wording with the 503 behaviour in `backend/README.md` and
   `.env.example`. *B01-AC-5.*

## Gate

- **B01-AC-1** — With any of `LIVEKIT_URL`, `LIVEKIT_API_KEY` or `LIVEKIT_API_SECRET` empty, an authenticated `POST /api/tutor/session` answers 503 with an `error` saying the voice tutor is not configured, and no `tutor_sessions` row is written. *Verify:* a vitest test with `createLiveKitMinter("", "", "")` and a row count before and after.
- **B01-AC-2** — With `GROQ_API_KEY` empty, an authenticated `POST /api/pronunciation` with a valid audio part answers 503 with an `error` saying pronunciation scoring is not configured, and no `pronunciation_attempts` row is written. *Verify:* a vitest test with `createGroqTranscriber("")`.
- **B01-AC-3** — With configured fakes, both routes behave as before. *Verify:* the existing `tutor.test.ts` and `pronunciation.test.ts` pass unchanged.
- **B01-AC-4** — When the pronunciation request fails with 503, `RecordExercise` shows a message that scoring is not available, not the generic error. *Verify:* a jest test with the pronunciation API mocked to reject with a 503 `ApiError`.
- **B01-AC-5** — No doc claims the AI routes "degrade gracefully"; `backend/README.md` describes the 503 behaviour. *Verify:* `! grep -rn "degrade gracefully" backend/README.md .env.example` exits 0 and `grep -n "503" backend/README.md` finds the line.

## Risks

- The minter's constructor builds a `RoomServiceClient` from an empty URL today; make sure building
  the app without keys still succeeds (it does today, the server boots).
- `RecordExercise.tsx` is also touched by W01 (MIME type); keep this change to the error branch.
