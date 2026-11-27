# A11 — web-auth

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | A01, A03, A04 | A13, D07 | S |

**Owns:** `app/__tests__/web-auth.test.tsx`
**Resolves:** #55

## Purpose

The app does not run in a browser. `npx expo export -p web` needs `react-dom` and `react-native-web`, which
`app/package.json` (A01) does not list, and no script exports the web build. Once they are added, sign-in fails
on web: `POST /api/auth/login` answers 200, but `app/src/api/tokenStorage.ts` (A03) stores the tokens with
`expo-secure-store`, whose web module is an empty object (`ExpoSecureStore.web.js` is `export default {}`), so
`SecureStore.setItemAsync` throws a `TypeError`. The sign-in and sign-up screens (`app/app/(auth)/`, A04) catch
every error that is not an `ApiError` and show "Could not sign in. Check your connection." (or "Could not create
your account. Check your connection."), so a failure on the device reads as a network problem.

This node makes the app export for web and sign in there. On web the tokens live in `localStorage` behind the
same `tokenStorage` functions, as OD1's default says; native keeps SecureStore. The two screens show the
connection message only when the request never reached the backend, and a different message for a failure on
the device. Keyless app tests pin all three. A probe of the export with a `localStorage` token store patched in
(issue #55) showed sign-in, the skill path and a lesson rendering and loading from the API.

## Tests

`app/__tests__/web-auth.test.tsx` (jest-expo, no key, no network). jest-expo's preset resolves modules for a
native platform, not web, so the test imports the web token store by its file (`@/api/tokenStorage.web`) and
the native one by its file (`@/api/tokenStorage.ts`, or the module path that resolves to it). The test gives
`localStorage` an in-memory `Storage` stand-in of its own and mocks `expo-secure-store` with jest functions.

- **Web token store.** `saveTokens` then `getAccessToken` and `getRefreshToken` return the saved pair;
  `clearTokens` makes both return `null`; both return `null` on an empty store. The values sit in `localStorage`
  under `ljiljan.accessToken` and `ljiljan.refreshToken`, the keys the native store uses, and no
  `expo-secure-store` function is called.
- **Same functions.** The web module exports the same function names as the native one.
- **Native token store.** `saveTokens`, the getters and `clearTokens` call `expo-secure-store`'s
  `setItemAsync`, `getItemAsync` and `deleteItemAsync` with those keys, as today, and touch no `localStorage`.
- **Sign-in errors.** The sign-in screen renders (with the auth store and the real API client; global `fetch`
  is a jest mock):
  - `fetch` rejects (the request never reached the backend): the screen shows the connection message;
  - `fetch` answers 200 with a token pair and a user, and storing the tokens throws a `TypeError` (the token
    store is mocked to throw): the screen shows a message that does not mention the connection;
  - `fetch` answers 401 with `{ "error": "Invalid email or password" }`: the screen shows that message, as
    today.
- **Sign-up errors.** The same three cases on the sign-up screen, with its own messages.

Today the web token store module does not exist and the device-failure cases show the connection message; the
native token store cases and the 401 cases pass.

## Changes

- `app/package.json`: `react-dom` and `react-native-web` as dependencies, at the versions
  `npx expo install react-dom react-native-web` picks for Expo SDK 57 (`react-dom` matches `react`, 19.2.3),
  and a script `"export:web": "expo export -p web"`, which writes the export to `app/dist/` (already in
  `app/.gitignore`). `app/package-lock.json` changes with them, through the install in `app/`. Nothing else in
  the file changes.
- `app/src/api/tokenStorage.web.ts`: new. The same exports as `tokenStorage.ts` (`TokenPair`, `saveTokens`,
  `getAccessToken`, `getRefreshToken`, `clearTokens`), async like them, keeping both tokens in
  `window.localStorage` under the same keys. Metro picks it over `tokenStorage.ts` in a web bundle, so no
  caller changes. A comment says why (OD1: same origin, short-lived access token, the 30-day refresh token is
  the exposure, rotation limits it).
- `app/src/api/tokenStorage.ts`: unchanged.
- `app/src/api/client.ts`: a request whose `fetch` rejects (the backend was never reached) rejects with an error
  the screens can tell apart from any other, e.g. a `NetworkError` class exported beside `ApiError`. The
  refresh-and-retry and `ApiError` behaviour do not change.
- `app/app/(auth)/sign-in.tsx` and `app/app/(auth)/sign-up.tsx`: an `ApiError` shows its message, as today; the
  network error shows the connection message, as today; any other error shows a message that says something
  went wrong on this device and does not mention the connection, and is logged with `console.error`. Nothing
  else on the screens changes.
- `app/__tests__/web-auth.test.tsx`: new, the cases above.

## Gate

- **A11-AC-1** — On web the token functions keep both tokens in `localStorage` under `ljiljan.accessToken` and `ljiljan.refreshToken`: saved tokens are read back, cleared tokens read as `null`, and no `expo-secure-store` function is called. The web module exports the same function names as the native one. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-auth.test.tsx)` (the web token store cases).
- **A11-AC-2** — On native the token functions still use `expo-secure-store` with the same keys and no `localStorage`, and `app/src/api/tokenStorage.ts` is unchanged. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-auth.test.tsx)` (the native token store cases), and the reviewer reads the diff.
- **A11-AC-3** — The sign-in screen shows the connection message only when the request never reached the backend; when the login succeeds and storing the tokens throws, it shows a message that does not mention the connection; an `ApiError` still shows its own message. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-auth.test.tsx)` (the sign-in cases).
- **A11-AC-4** — The sign-up screen behaves the same way for the register request. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-auth.test.tsx)` (the sign-up cases).
- **A11-AC-5** — `app/package.json` lists `react-dom` and `react-native-web` as dependencies and has an `export:web` script that runs `expo export -p web`; a run of `npm run export:web` in `app/` exits 0 and writes `app/dist/index.html`, and the PR records that run. *Verify:* the reviewer reads `app/package.json` and the recorded run (a local run, advisory per OD9; D07's `Images` job runs the export in CI).
- **A11-AC-6** — The app suite and `npx tsc --noEmit` in `app/` pass. *Verify:* `(cd app && npx tsc --noEmit)` and CI's app job.

## Risks

- `localStorage` is readable by any script on the origin, so an XSS bug would expose the 30-day refresh token.
  OD1 accepts that for the same-origin web build; httpOnly cookies would need a rework of the backend's auth.
- The tests import the web module by its file; that Metro picks `tokenStorage.web.ts` in a web bundle is
  checked by the export and, in CI, by D07's stack check, not by jest.
- A browser with storage disabled, or Safari's private mode on an old version, throws from `localStorage`; the
  screens then show the device-failure message, not a silent failure.
- `react-native-web` must stay on the version Expo SDK 57 expects; a later SDK bump moves it with
  `npx expo install`, not by hand (principle 6).
- The export takes a large share of the loop machine's memory (4 CPUs, about 8 GB); the session runs it once,
  alone.
- A real browser sign-up, reload and sign-in on the deployed stack is a post-merge check the owner records.
