# W04 — web-voice-tutor

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | W01 | T01 | M |

**Owns:** `app/src/features/tutor/VoiceCallLive.web.tsx`, `app/src/features/tutor/availability.ts`, `app/app/tutor.tsx` (fallback texts only), `app/package.json` and `app/package-lock.json` (only if a LiveKit web package is missing), `app/README.md` (voice tutor on the web)

## Purpose

On the web the Expo native plugins do not apply; the tutor uses LiveKit's web SDK in the browser
(owner's answer to Q6). `livekit-client` and `@livekit/components-react` are already dependencies;
the native screen (`VoiceCallLive.tsx`) uses `@livekit/react-native`. W01 left a web placeholder
(`VoiceCallLive.web.tsx`) that this node fills in with the same call UI as native: status from the
agent's state, the tutor's transcript, mic toggle, interrupt and end call.

Acceptance is headless: no real microphone and no LiveKit server in tests. One real call in a browser
with live keys is the owner's step after merge (OD10), not a merge gate. Session end is T01.

## Tests

Jest tests with `@livekit/components-react` and `livekit-client` mocked. Keep the existing
availability tests (native behaviour). Red target, e.g.
`cd app && npx jest src/features/tutor/__tests__/VoiceCallLive.web.test.tsx`.

## Changes

1. `VoiceCallLive.web.tsx`: request the session (`useTutorSession`), join with `LiveKitRoom` from
   `@livekit/components-react` (audio on, video off), render remote audio
   (`RoomAudioRenderer`), and the call UI. *W04-AC-1, W04-AC-5.*
2. Error states: a 503 from `POST /api/tutor/session` shows "not configured"; a denied microphone
   shows how to allow it; both with a Back button. *W04-AC-3, W04-AC-4.*
3. Autoplay: when the browser blocks audio, show a control that calls `room.startAudio()`.
   *W04-AC-6.*
4. `availability.ts`: on web, available when `navigator.mediaDevices.getUserMedia` exists;
   `EXPO_PUBLIC_ENABLE_VOICE_TUTOR` still overrides; native unchanged. Adjust `app/tutor.tsx`'s
   fallback text so it fits both platforms. *W04-AC-2.*
5. `app/README.md`: the tutor works in a browser over HTTPS or on `localhost`. *W04-AC-7.*

## Gate

- **W04-AC-1** — With a session `{ url, token, sessionId }`, the web call screen renders `LiveKitRoom` with that `serverUrl` and `token`, `audio` on and `video` off, and never imports `@livekit/react-native`. *Verify:* a jest test with the LiveKit modules mocked and `@livekit/react-native` mocked to throw on import.
- **W04-AC-2** — On web, `isVoiceTutorAvailable()` is true when `navigator.mediaDevices.getUserMedia` exists and false when it does not; `EXPO_PUBLIC_ENABLE_VOICE_TUTOR=false|true` still wins; the native results are unchanged. *Verify:* jest cases in the availability tests with `Platform.OS` stubbed.
- **W04-AC-3** — When `POST /api/tutor/session` answers 503, the screen says the voice tutor is not configured (distinct from the generic error) and offers Back. *Verify:* a jest test with the tutor API mocked to reject with a 503 `ApiError`.
- **W04-AC-4** — When joining fails because microphone access was denied (`NotAllowedError`), the screen tells the learner to allow microphone access and offers Back. *Verify:* a jest test where the mocked room reports a `NotAllowedError`.
- **W04-AC-5** — In a connected call: the status label follows the agent state (listening, thinking, speaking), the tutor's transcriptions are listed, the mic button toggles the microphone, Interrupt publishes `{"type":"interrupt"}` reliably on topic `lk.interrupt`, and End disconnects and calls `onEnd`. *Verify:* jest tests with the LiveKit hooks mocked.
- **W04-AC-6** — When the room reports that audio playback is blocked, the screen shows a control that calls `room.startAudio()`. *Verify:* a jest test with the mocked room's `canPlaybackAudio` false.
- **W04-AC-7** — The web export still succeeds and `app/README.md` says the voice tutor runs in a browser over HTTPS or on `localhost`. *Verify:* CI's app job (web export step from W01) passes on the node's PR, and `grep -n "HTTPS" app/README.md` finds the line.

## Risks

- OD10: headless tests cannot prove audio flows; the owner's post-merge browser call can still find
  problems (codec, autoplay, agent dispatch). File them as issues.
- `@livekit/components-react` hook names differ slightly from `@livekit/react-native`'s; check the
  installed version's exports before writing tests.
- The interrupt message does nothing until T02 lands.
