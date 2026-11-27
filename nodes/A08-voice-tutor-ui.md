# A08 — voice-tutor-ui

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | A02, A03, A04 | A13 | M |

**Owns:** `app/src/features/tutor/`, `app/app/tutor.tsx`, `app/app/(tabs)/tutor.tsx`

## Purpose

Imported from the code. The app's side of the real-time voice tutor: it asks the backend for a LiveKit room
token (B09) and joins the room, where the voice agent talks with the learner. The app never holds a LiveKit
key, only the short-lived room token (principle 1). Its screens are the Tutor tab of A04's tab bar and the
`tutor` modal of A04's root stack.

- `app/app/(tabs)/tutor.tsx`: the Tutor tab's landing screen ("Talk with Ljilja", a tip about headphones
  and a Bosnian-only call) with "Start conversation", which opens `/tutor`.
- `app/app/tutor.tsx`, the full-screen call route: when the voice tutor is unavailable it shows "Voice tutor
  needs a development build" and "Back". Otherwise it waits for the courses, derives the learner's level, and
  renders `VoiceCallLive` with it, loaded with `React.lazy` so LiveKit and its native WebRTC module never
  enter the boot bundle; ending the call goes back.
- `app/src/features/tutor/availability.ts`: `isVoiceTutorAvailable()` is forced by
  `EXPO_PUBLIC_ENABLE_VOICE_TUTOR` (`'true'` or `'false'`); otherwise it is false only inside Expo Go
  (`executionEnvironment` `storeClient`), which ships no WebRTC.
- `app/src/features/tutor/level.ts`: `deriveLearnerLevel(courses)` is the level of the highest-ordered unit
  with an unlocked skill, read as A1, A2, B1 or B2 (another value reads as A1), and A1 without courses or
  with nothing unlocked.
- `app/src/features/tutor/VoiceCallLive.tsx` registers LiveKit's WebRTC globals when loaded, requests a
  session for the level (A03's `useTutorSession`; "Connecting to Ljilja…" meanwhile, and "Couldn't start the
  tutor session. Please try again." with "Back" on failure), and joins the room with the returned URL and
  token, audio on. The call shows "Connecting…" until connected, then the agent's state ("Listening…",
  "Ljilja is thinking…", "Ljilja is speaking", else "Connected"), a "Transkript" card with the agent's
  transcribed turns (or "Say something in Bosnian to start…"), and three controls: mute and unmute the
  microphone; interrupt, enabled only while the agent speaks, which publishes `{"type":"interrupt"}`
  reliably on the data topic `lk.interrupt`; and end call, which disconnects and leaves. A disconnect from
  the room also leaves.

## Tests

`app/src/features/tutor/__tests__/availability.test.ts`: `isVoiceTutorAvailable` in Expo Go, in a standalone
build, and with each value of the override, `expo-constants` mocked. `level.ts`, the call screen and
`VoiceCallLive` have no test.

## Changes

none: imported

## Gate

- **A08-AC-1** — In Expo Go, without an override, the voice tutor is unavailable. *Verify:* `app/src/features/tutor/__tests__/availability.test.ts` ("is false when running in Expo Go (executionEnvironment === \"storeClient\")").
- **A08-AC-2** — Outside Expo Go, without an override, the voice tutor is available. *Verify:* `app/src/features/tutor/__tests__/availability.test.ts` ("is true in a dev/standalone build (not Expo Go)").
- **A08-AC-3** — `EXPO_PUBLIC_ENABLE_VOICE_TUTOR` set to `false` or `true` decides availability whatever the runtime. *Verify:* `app/src/features/tutor/__tests__/availability.test.ts` ("respects EXPO_PUBLIC_ENABLE_VOICE_TUTOR=\"false\" even outside Expo Go"), `app/src/features/tutor/__tests__/availability.test.ts` ("respects EXPO_PUBLIC_ENABLE_VOICE_TUTOR=\"true\" even inside Expo Go").
- **A08-AC-4** — When the tutor is unavailable, the call screen shows the development-build message and loads no LiveKit code. *Verify:* unpinned.
- **A08-AC-5** — The learner's level is the level of the highest-ordered unit with an unlocked skill, A1 by default. *Verify:* unpinned.
- **A08-AC-6** — The call requests a session for that level and joins the room with the returned URL and token. *Verify:* unpinned.
- **A08-AC-7** — End call disconnects from the room and leaves the call screen. *Verify:* unpinned.

## Risks

- A real call needs LiveKit, Groq and Azure keys and a microphone, so the call is checked only by hand, after
  merge (OD7).
- The availability check has no case for the web: there it is true unless `expo-constants` reports Expo Go,
  and the call screen then loads `@livekit/react-native`, a React Native WebRTC binding. The web voice tutor
  is planned work (priority 5).
- The session's `sessionId` is not used: no session end or turns are sent (a `TODO` in `VoiceCallLive`,
  and `FOLLOWUPS.md`).
- No code under `voice-agent/` reads the `lk.interrupt` topic; barge-in relies on the agent's voice detection.
- The transcript shows only the agent's turns, not the learner's.
- End call runs `room.disconnect()` and then `onEnd`, and the room's `onDisconnected` is also `onEnd`, so the
  screen can be asked to go back twice.
- `deriveLearnerLevel` compares units by `orderIndex` across every course.
- Opening the call screen again asks for a new room (`useTutorSession` caches nothing).
