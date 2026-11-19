# B04 — service-adapters

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B02, B03 | B05, B07, B08, B09, B10, V05 | S |

**Owns:** `backend/src/deps.ts`, `backend/src/services/groq.ts`, `backend/src/services/livekit.ts`, `backend/scripts/smoke-groq.ts`, `backend/test/helpers.ts`

## Purpose

Imported from the code. The injected dependencies of the routes, the two external services behind them, and
their test fakes.

- `backend/src/deps.ts`: `AppDeps`, the `{ db, transcriber, minter }` that every route is given, so tests can pass in
  fakes instead.
- `backend/src/services/groq.ts`: the `Transcriber` interface (`transcribe(audio, filename)` returns the text)
  and `createGroqTranscriber(apiKey = GROQ_API_KEY)`, which sends the audio to Groq's `whisper-large-v3` with
  `language: "bs"` and `temperature: 0` and returns the trimmed text.
- `backend/src/services/livekit.ts`: the `RoomTokenMinter` interface and `createLiveKitMinter(apiKey, apiSecret,
  url)` (defaults from B02). `mint(identity, roomName, metadata)` first, when the metadata has a `level` or a
  `scenario`, creates the room with that JSON as its metadata (on any error it updates the existing room's
  metadata instead), then returns `{ token, url, roomName }`: a LiveKit access token for that identity with a
  one-hour TTL and the grants join, publish and subscribe for that room only. The room service uses the URL
  with `wss://`/`ws://` turned into `https://`/`http://`. `TutorRoomMetadata` (`{ level?, scenario? }`) is the
  shape `voice-agent/agent.py` reads from the room's metadata.
- `backend/scripts/smoke-groq.ts` (`npm run smoke:groq`): with `GROQ_API_KEY` set, transcribes a synthetic
  half-second 220 Hz WAV through the real Groq API and prints the transcript; without it, prints that it skips
  and exits 0.
- `backend/test/helpers.ts`: `fakeTranscriber(text)` always returns `text`; `fakeMinter(overrides)` returns a
  fixed grant (`fake-token`, `wss://fake.livekit.cloud`, the requested room name, each overridable) and records
  every `mint()` call with its metadata on `.calls`.

## Tests

`backend/test/helpers.ts` is the fakes the route tests use (B05, B07, B08, B09, B10). No test calls
`createGroqTranscriber` or `createLiveKitMinter`: they need keys, which tests may not use (principle 4). The
smoke script is run by hand only.

## Changes

none: imported

## Gate

- **B04-AC-1** — Routes reach the transcriber and the minter only through `AppDeps`, so a test replaces both with the fakes of `helpers.ts` and runs without a key. *Verify:* `backend/test/tutor.test.ts` ("mints a room token, returns a sessionId, and records a tutor session"), `backend/test/pronunciation.test.ts` ("scores a real multipart audio upload end-to-end").
- **B04-AC-2** — `fakeMinter` records each `mint()` call's metadata on `.calls`. *Verify:* `backend/test/tutor.test.ts` ("forwards {level, scenario} to the LiveKit minter as room metadata, and persists level").
- **B04-AC-3** — `createGroqTranscriber` transcribes with `whisper-large-v3`, language `bs`, temperature 0, and returns the trimmed text. *Verify:* unpinned.
- **B04-AC-4** — `createLiveKitMinter().mint` sets the room's metadata to the JSON `{level, scenario}` before it returns the token, only when either is given, and the token grants join, publish and subscribe for that one room for one hour. *Verify:* unpinned.
- **B04-AC-5** — `npm run smoke:groq` exits 0 without calling Groq when `GROQ_API_KEY` is unset. *Verify:* unpinned.

## Risks

- With an empty key, the Groq client and the LiveKit room service are still created; the failure comes at the
  first call, as an error the app answers with a 500, not principle 7's 503 (`SPEC.md`, known gaps).
- `mint()` treats any `createRoom` error, a network failure included, as "the room exists" and retries with
  `updateRoomMetadata`; only that second error reaches the caller.
- The smoke script exits 0 without a key, by design (it is opt-in), unlike principle 7's rule for scripts.
- Nothing checks that `TutorRoomMetadata` matches what `voice-agent/agent.py` parses; the two sides are kept in
  step by hand.
