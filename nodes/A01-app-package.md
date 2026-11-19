# A01 — app-package

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | A02, A03, D01 | S |

**Owns:** `app/package.json`, `app/package-lock.json`, `app/.npmrc`, `app/tsconfig.json`, `app/babel.config.js`, `app/app.json`, `app/.env.example`, `app/.gitignore`, `app/README.md`, `app/LICENSE`

## Purpose

Imported from the code. The Expo (React Native + TypeScript) client's package. `app/` is not a member of the
root workspace (R01): it has its own lockfile and its own `npm ci`, as CI's `app` job runs it.

- `app/package.json` (name `app`, private, entry `expo-router/entry`) requires Expo SDK 57 (`expo ~57.0.2` and
  the `expo-*` modules it declares: audio, constants, haptics, linking, router, secure-store, splash-screen,
  status-bar, system-ui), React 19.2.3, React Native 0.86.0, Reanimated 4.5.0 with react-native-worklets
  0.10.0, gesture-handler, safe-area-context, screens, TanStack Query 5, Zustand 5, and LiveKit
  (`@livekit/react-native`, `@livekit/react-native-webrtc`, `@livekit/components-react`, `livekit-client`).
  Its scripts are `start`, `android`, `ios` and `web` (each `expo start`), `typecheck` (`tsc --noEmit`) and
  `test` (`jest`). Its `jest` key sets the `jest-expo` preset, the worklets jest resolver, and a
  `transformIgnorePatterns` that lets Babel transform React Native, Expo, React Navigation and LiveKit
  packages. Dev dependencies: jest ~29.7, jest-expo, `babel-preset-expo`, `@react-native/jest-preset`,
  `@testing-library/react-native` 14, `react-test-renderer`, `test-renderer`, `@types/jest`, `@types/react`
  and TypeScript ~6.0.
- `app/package-lock.json` (lockfile version 3) pins the tree; `app/.npmrc` sets `legacy-peer-deps=true`.
- `app/tsconfig.json` extends `expo/tsconfig.base` (not the root `tsconfig.base.json`), turns on `strict`,
  adds the jest types, and maps the `@/*` alias to `./src/*`.
- `app/babel.config.js` uses `babel-preset-expo` with `react-native-worklets/plugin` as the last plugin.
- `app/app.json` names the app Ljiljan (slug `ljiljan`, scheme `ljiljan`, version 1.0.0, portrait, new
  architecture on), with the bundle id and package `com.ljiljan.app`, the microphone permission texts
  (`NSMicrophoneUsageDescription`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`), the icons under `app/assets/`
  (out of scope), web with the Metro bundler, the plugins expo-router, expo-splash-screen, expo-secure-store
  and expo-audio, and `extra.apiBaseUrl` `http://localhost:3000`.
- `app/.env.example` documents the one public setting, `EXPO_PUBLIC_API_BASE_URL`, and says that
  `EXPO_PUBLIC_*` values are inlined into the bundle and so are never secret (principle 1).
- `app/.gitignore` ignores `node_modules/`, Expo and Metro output (`.expo/`, `dist/`, `web-build/`),
  native signing files, `.env*.local`, and the generated `/ios` and `/android` folders.
- `app/README.md` tells how to run the app (`npm install`, copy `.env.example`, `npx expo start`), that the
  voice tutor needs a development build because Expo Go has no native WebRTC, the stack, the source layout,
  and the checks (`npx tsc --noEmit`, `npx jest`).
- `app/LICENSE` is the MIT license of the Expo project template (copyright 650 Industries).

## Tests

None of its own. CI's `app` job runs `npm ci`, `npx tsc --noEmit` and `npx jest` in `app/`, which exercises
this configuration: every app test (A03 to A08) runs through the jest config here.

## Changes

none: imported

## Gate

- **A01-AC-1** — The app's tests run under jest with the `jest-expo` preset and resolve the `@/` alias to `app/src/`. *Verify:* `app/app/(tabs)/__tests__/home.test.tsx` ("renders the skill path (not the empty state) when a course with units is returned").
- **A01-AC-2** — `npx tsc --noEmit` in `app/` passes with `strict` on. *Verify:* unpinned.
- **A01-AC-3** — `app/.env.example` holds only `EXPO_PUBLIC_*` settings and no key. *Verify:* unpinned.
- **A01-AC-4** — `app/app.json` declares the microphone permission for iOS and Android. *Verify:* unpinned.

## Risks

- Most dependencies use `^` or `~` ranges in `package.json`; only the lockfile pins them (principle 6).
- `legacy-peer-deps=true` hides peer-dependency conflicts at install time.
- `app/LICENSE` is the Expo template's license, not a statement of this project's license.
- The README's "Run" section uses `npm install`, which can change the lockfile; CI uses `npm ci`.
- The README's notes say a "listen" control soft-fails on placeholder audio; nothing serves real reference
  audio to the app yet (OD4).
- `extra.apiBaseUrl` hard-codes `http://localhost:3000`, so the `http://localhost:3000` fallback of A03's
  config is reached only when `expo-constants` reports no config.
- Typecheck is a CI step but not part of the gate (it names no test), so A01-AC-2 is checked only by CI.
