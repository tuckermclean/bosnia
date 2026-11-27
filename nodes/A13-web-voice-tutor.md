# A13 — web-voice-tutor

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | A08, A11 | none | M |

**Owns:** `app/__tests__/web-voice-tutor.test.tsx`
**Resolves:** #55

## Purpose

On web, `/tutor` renders a blank page with `TypeError: (0 , r(...).requireNativeComponent) is not a function`
(issue #55). The call screen (`app/app/tutor.tsx`, A08) lazily loads
`app/src/features/tutor/VoiceCallLive.tsx`, which imports `@livekit/react-native` and calls its
`registerGlobals()`; both need the native WebRTC module, which a browser does not have.
`isVoiceTutorAvailable()` (`app/src/features/tutor/availability.ts`) answers true on web, and nothing catches
an error from the lazily loaded component, so the whole screen goes blank.

A browser has WebRTC built in, and `livekit-client` and `@livekit/components-react` are already dependencies
(A01). This node gives the web build its own call component, `VoiceCallLive.web.tsx`, on those two packages,
which Metro picks over `VoiceCallLive.tsx` in a web bundle. It shows the same call (status, the tutor's
transcript, mute, interrupt, end call) and plays the tutor's audio. The tutor is available on web, and a call
that fails to load, to render or to get the microphone shows a message with a way back instead of a blank
page. Native and Expo Go keep today's behaviour.

## Tests

`app/__tests__/web-voice-tutor.test.tsx` (jest-expo, no key, no network). The preset resolves modules for a
native platform, so the test imports `VoiceCallLive.web.tsx` by its file. `@livekit/react-native` and
`@livekit/react-native-webrtc` are mocked to throw when loaded, so a web module that reaches either one fails
the test. `@livekit/components-react` is mocked: `LiveKitRoom` renders its children and records its props,
`RoomAudioRenderer` renders a marker, and the room, connection-state, local-participant and voice-assistant
hooks return values each case sets. `useTutorSession` (`@/hooks/useTutor`) is mocked.

- **Session.** While the session loads, the connecting text shows; when it fails, today's "Couldn't start the
  tutor session" message and a Back button that calls `onEnd`.
- **Room.** With a session, `LiveKitRoom` gets the session's `url` and `token`, `connect` and `audio`, and the
  tutor's audio renderer is rendered inside it.
- **Call.** Before the room connects the status reads "Connecting…"; once connected it follows the agent's
  state ("Listening…", "Ljilja is thinking…", "Ljilja is speaking", "Connected"); the tutor's transcript
  segments are listed; mute calls `setMicrophoneEnabled` with the opposite of the current state; interrupt
  publishes the `interrupt` data message on the `lk.interrupt` topic; end call disconnects the room and calls
  `onEnd`.
- **Microphone.** When `LiveKitRoom` reports a media-device failure (its `onMediaDeviceFailure`) or a room error
  (its `onError`), the component shows a message that says the microphone (or the call) is not available, and a
  Back button.
- **Availability.** With `Platform.OS` `web` and no override, `isVoiceTutorAvailable()` is true; with
  `EXPO_PUBLIC_ENABLE_VOICE_TUTOR=false` it is false.
- **Screen.** `app/app/tutor.tsx` renders with the courses hook and the router mocked, and the call component
  mocked to throw while rendering: the screen shows "The voice tutor couldn't start." and a Back button that
  calls `router.back()`. The same when loading the call component's module fails.

Today `VoiceCallLive.web.tsx` does not exist and the screen cases render nothing; the availability case passes
already on the jest platform's `bare` environment, and stays as a pin.

## Changes

- `app/src/features/tutor/VoiceCallLive.web.tsx`: new, the same props and default export as
  `VoiceCallLive.tsx`, on `@livekit/components-react` (`LiveKitRoom`, `RoomAudioRenderer`, `useRoomContext`,
  `useConnectionState`, `useLocalParticipant`, `useVoiceAssistant`) and `livekit-client`. It imports neither
  `@livekit/react-native` nor `@livekit/react-native-webrtc` and calls no `registerGlobals()`. It handles
  `LiveKitRoom`'s `onMediaDeviceFailure` and `onError` with the message above. The call UI may be shared with
  `VoiceCallLive.tsx` through a module both import, as long as that module reaches no native LiveKit package
  and the native call's behaviour does not change.
- `app/src/features/tutor/availability.ts`: on web (`Platform.OS === 'web'`) the tutor is available unless
  `EXPO_PUBLIC_ENABLE_VOICE_TUTOR` is `false`; the Expo Go rule for native does not change.
- `app/app/tutor.tsx`: an error boundary around the lazily loaded call catches an error from loading or rendering
  it and shows "The voice tutor couldn't start." with a Back button. The rest of the screen does not change.
- `app/src/features/tutor/VoiceCallLive.tsx`: unchanged, apart from importing the shared call UI if the
  implementer shares it.
- `app/__tests__/web-voice-tutor.test.tsx`: new, the cases above.

## Gate

- **A13-AC-1** — `VoiceCallLive.web.tsx` joins the session's room with `@livekit/components-react`'s `LiveKitRoom` (the session's `url` and `token`, `connect`, `audio`) and renders the tutor's audio, without loading `@livekit/react-native` or `@livekit/react-native-webrtc`. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-voice-tutor.test.tsx)` (the session and room cases), and the reviewer reads the web file's imports.
- **A13-AC-2** — The web call shows the connection and agent status, the tutor's transcript, and working mute, interrupt and end-call controls, as the native call does. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-voice-tutor.test.tsx)` (the call cases).
- **A13-AC-3** — A microphone or room failure in the web call shows a message and a Back button, not a silent or blank call. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-voice-tutor.test.tsx)` (the microphone cases).
- **A13-AC-4** — On web the tutor is available unless `EXPO_PUBLIC_ENABLE_VOICE_TUTOR` is `false`, and the existing availability cases for Expo Go and native builds still pass. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-voice-tutor.test.tsx src/features/tutor/__tests__/availability.test.ts)`.
- **A13-AC-5** — When the call component fails to load or to render, the tutor screen shows "The voice tutor couldn't start." and a Back button that goes back, instead of a blank page. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-voice-tutor.test.tsx)` (the screen cases).
- **A13-AC-6** — The native call keeps its behaviour: `VoiceCallLive.tsx` still joins with `@livekit/react-native` after `registerGlobals()`, and the app suite and `npx tsc --noEmit` in `app/` pass. *Verify:* the reviewer reads the diff of `VoiceCallLive.tsx`, `(cd app && npx tsc --noEmit)` and CI's app job.

## Risks

- The tests mock LiveKit, so they pin the wiring, not a call. A real browser call with the LiveKit, Groq and
  Azure keys on the deployed stack is a post-merge check the owner records (OD7).
- `@livekit/components-react`'s `LiveKitRoom` renders a DOM element inside react-native-web's views; it needs
  `react-dom`, which A11 adds.
- Browsers allow the microphone only in a secure context (HTTPS, or `localhost`); on plain HTTP the call gets a
  media-device failure, which shows the microphone message. D07 serves the stack over HTTPS.
- Browsers block audio playback until the page has had a user gesture; the call starts from a button press, which
  normally counts, but a browser that still blocks it plays nothing until the next interaction.
- Sharing the call UI between the two files changes `VoiceCallLive.tsx`'s imports; the native call is not run in
  jest beyond its existing tests, so a shared module is checked by review and typecheck.
