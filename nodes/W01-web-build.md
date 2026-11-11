# W01 — web-build

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | H02 | W03, W04 | M |

**Owns:** `app/package.json`, `app/package-lock.json`, `app/app.json` (web section only), `app/src/api/tokenStorage.web.ts` (new), `app/src/api/pronunciation.ts`, `app/src/features/pronunciation/RecordExercise.tsx` (MIME type only), `app/src/features/tutor/VoiceCallLive.web.tsx` (new placeholder), `app/README.md`, `.github/workflows/ci.yml` (app job: web export step)

## Purpose

The owner made Ljiljan a web app (SPEC.md, OD1). `app/package.json` has a `web` script, but the web
build has never been made to work (`docs/AUDIT.md`, P7):

- `react-native-web` is not a dependency (`react-dom` arrives with H02).
- Tokens are kept with `expo-secure-store`, which has no web implementation.
- The pronunciation upload appends React Native's `{ uri, name, type }` object, which a browser's
  `FormData` does not understand, and assumes `audio/m4a`; a browser recorder gives a `blob:` URL
  and usually `audio/webm`.
- The tutor screen lazy-loads `VoiceCallLive.tsx`, which imports `@livekit/react-native` and its
  native WebRTC module; that must stay out of the web bundle.

This node makes the app export and run in a browser with lessons and pronunciation working. The
browser voice call is W04; hosting is W03. Native code keeps compiling and its tests stay green
(principle 8).

## Tests

Keep every app test. Add jest tests for the web token storage, the web upload path and the web
placeholder module, and a CI step for the web export. Red target, e.g.
`cd app && npx jest src/api/__tests__/tokenStorage.web.test.ts`.

## Changes

1. Add `react-native-web` (and anything else `expo export --platform web` asks for) at the SDK's
   versions via `npx expo install`. *W01-AC-1, W01-AC-6.*
2. `app/src/api/tokenStorage.web.ts`: the same four functions as `tokenStorage.ts`, backed by
   `localStorage` under the same key names (OD3). *W01-AC-2.*
3. `submitPronunciation`: on web, fetch the recording's URI into a `Blob` and append it as a file
   with the blob's own MIME type and a matching file name; native keeps its current shape.
   `RecordExercise` passes the recorder's MIME type where it knows it. *W01-AC-3.*
4. `app/src/features/tutor/VoiceCallLive.web.tsx`: a web placeholder with the same props that
   imports nothing from `@livekit/react-native` (W04 replaces its body). *W01-AC-4.*
5. CI: the app job runs `npx expo export --platform web --output-dir dist`. *W01-AC-1.*
6. `app/README.md`: how to run the web build locally (`npm run web`, `EXPO_PUBLIC_API_BASE_URL`)
   and how to export it. *W01-AC-5.*

## Gate

- **W01-AC-1** — `npx expo export --platform web --output-dir dist` in `app/` exits 0 and writes `dist/index.html`. *Verify:* the new step in CI's app job passes on the node's PR (record the run URL), followed by `test -f dist/index.html`.
- **W01-AC-2** — On web, `saveTokens`, `getAccessToken`, `getRefreshToken` and `clearTokens` round-trip through `localStorage` under the keys `ljiljan.accessToken` and `ljiljan.refreshToken`. *Verify:* a jest test of `tokenStorage.web.ts` with a stub `localStorage`.
- **W01-AC-3** — On web, `submitPronunciation` sends a multipart `audio` part that is a `Blob` fetched from the recording URI, with the blob's MIME type (e.g. `audio/webm`); on native the existing `{ uri, name, type }` part is unchanged. *Verify:* a jest test with `Platform.OS` set to `web` and a mocked `fetch`, plus the existing native behaviour under the default platform.
- **W01-AC-4** — `VoiceCallLive.web.tsx` can be imported and rendered with `@livekit/react-native` mocked to throw on import. *Verify:* a jest test that mocks `@livekit/react-native` with a factory that throws, requires the module and renders it.
- **W01-AC-5** — `app/README.md` documents running and exporting the web build. *Verify:* `grep -n "expo export --platform web" app/README.md` and `grep -n "npm run web" app/README.md` both find lines.
- **W01-AC-6** — `expo-doctor` still passes and the native checks stay green. *Verify:* `cd app && npx expo-doctor` exits 0, and CI's app job (`tsc --noEmit`, `jest`) passes on the node's PR.

## Risks

- OD3: `localStorage` is readable by any script on the page; an XSS would expose the refresh token.
  B02's family revocation limits the damage; the cookie alternative stays open.
- `expo-audio` recording on web depends on the browser's `MediaRecorder`; Safari produces
  `audio/mp4`. The backend accepts any `audio/*` and Whisper accepts webm and mp4.
- Some native-only packages may still be pulled into the web bundle by other imports; the export
  step in CI catches it.
- `app/package-lock.json` is also changed by H02 (a dep) and W04.
