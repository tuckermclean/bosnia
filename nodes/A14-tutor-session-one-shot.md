# A14 — tutor-session-one-shot

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | A03 | none | S |

**Owns:** `app/__tests__/tutor-session.test.tsx`
**Resolves:** #62

## Purpose

`useTutorSession` (`app/src/hooks/useTutor.ts`, A03) requests the call's LiveKit room and token as a TanStack
query with `staleTime: 0`, `gcTime: 0`, `retry: false` and `refetchOnWindowFocus: false`, and leaves
react-query's default `refetchOnReconnect: true`. When react-query's online manager goes from offline to online
(in a browser, the window's `online` event after a network drop), the stale query runs again. Each run asks the
backend for a new session (`POST /api/tutor/session`, B09), which creates a new room and a new session row, and
the call component (`VoiceCallLive.tsx`, A08, and `VoiceCallLive.web.tsx`, A13) hands the new token to
`LiveKitRoom`. A short network drop can therefore move the learner to an empty room mid-call. The hook's own
comment calls the session one-shot.

This node makes the session one-shot: once the hook has a session (or a failure), nothing short of a new mount
requests another, so a reconnect or a window focus leaves the call in its room. A new mount, which is a new
call, still requests a new session, as today. The finding comes from reading the code (issue #62); it was not
seen in a browser.

## Tests

`app/__tests__/tutor-session.test.tsx` (jest-expo, no key, no network). `tutorApi.startTutorSession` (`@/api`)
is a jest mock that answers with a session (`sessionId`, `url`, `token`, `roomName`) or rejects, as each case
sets. A small component renders `useTutorSession(level, scenario)` inside a `QueryClientProvider` with a fresh
`QueryClient` per test and shows the session's token, or an error marker. The test drives react-query's
`onlineManager` (`setOnline(false)` then `setOnline(true)`) and `focusManager` (`setFocused(false)` then
`setFocused(true)`) directly, and restores both after each test.

- **Mount.** On mount the hook calls `startTutorSession` once, with the level and scenario it was given, and
  the component shows the session's token.
- **Reconnect.** After the session has loaded, the online manager goes offline and back online:
  `startTutorSession` is still called once, and the component still shows the first token.
- **Focus.** After the session has loaded, the window loses and regains focus: `startTutorSession` is still
  called once.
- **Failure.** `startTutorSession` rejects: the component shows the error and the call is not retried.
- **New mount.** Unmounting the component, letting the unused query be dropped (`gcTime: 0`, a timer tick),
  and mounting it again calls `startTutorSession` a second time and shows the second token.

Today the reconnect case fails (a second call and the second token); the mount, focus, failure and new-mount
cases pass already and stay as pins.

## Changes

- `app/src/hooks/useTutor.ts`: `useTutorSession` sets `refetchOnReconnect: false`, or makes the query one-shot
  another way (for example `staleTime: Infinity`, which also stops a reconnect, a focus or a remount of the same
  observer from refetching, while `gcTime: 0` still drops the session when the call unmounts so the next call
  requests a new one). The hook's signature and return value do not change, and its comment says what makes it
  one-shot.
- `app/__tests__/tutor-session.test.tsx`: new, the cases above.

## Gate

- **A14-AC-1** — After `useTutorSession` has a session, react-query's online manager going offline and back online does not call `startTutorSession` again, and the hook keeps the first session's token. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/tutor-session.test.tsx)` (the reconnect case).
- **A14-AC-2** — On mount `useTutorSession` calls `startTutorSession` once with its level and scenario; a window focus does not call it again, and a rejected call is not retried. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/tutor-session.test.tsx)` (the mount, focus and failure cases).
- **A14-AC-3** — A new mount of the hook, a new call, calls `startTutorSession` again and gets the new session. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/tutor-session.test.tsx)` (the new-mount case).
- **A14-AC-4** — The tutor's existing tests and the app's typecheck still pass. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath src/features/tutor/__tests__/voice-tutor.test.tsx __tests__/web-voice-tutor.test.tsx)`, `(cd app && npx tsc --noEmit)` and CI's app job.

## Risks

- The test drives react-query's online manager, not a real network drop. Whether a call survives a drop in a
  browser, and what LiveKit itself does then, is part of the owner's post-merge browser check (OD7), with the
  autoplay and full-screen checks A13 names.
- On native the app wires no NetInfo listener into react-query's online manager, so a reconnect does not
  normally reach it there; the change matters on web, and is harmless on native.
- After a failed request, a reconnect may still run the query again (an errored query has no data and stays
  stale); this node pins only that a failure is not retried, and a later request shows a call where the error
  was, which the screen already handles.
- A call whose room is really lost (LiveKit disconnects for good) still leaves the screen through the room's
  `onDisconnected`, as today; this node adds no rejoin with a new session.
