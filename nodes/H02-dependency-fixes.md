# H02 — dependency-fixes

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | W01 | S |

**Owns:** `package.json`, `package-lock.json`, `backend/package.json`, `content/package.json`, `app/package.json`, `app/package-lock.json`, `app/app.json`

## Purpose

The audit (`docs/AUDIT.md`, section 2 and P8) found 5 high `npm audit` findings in the root workspace
(fastify ≤5.12.4, find-my-way ≤9.6.0, @fastify/busboy ≤3.2.1, fast-uri, zod <4.6.6) and 4 failing
`expo-doctor` checks in `app/`: an invalid `newArchEnabled` key in `app.json`, missing peers
`react-dom` (needed by `@livekit/components-react`) and `expo-asset` (needed by `expo-audio`), and
`expo@57.0.2`, which has the Hermes V1 memory regression (fixed in expo ≥57.0.9 / react-native
≥0.86.2). Principle 6: these are deliberate, pinned bumps.

## Tests

No new tests. Keep every existing suite green: backend (51), content (26), app jest (25),
voice-agent (9). The red target is the audit and doctor commands:
`npm audit --omit=dev --audit-level=high && (cd app && npx expo-doctor)`.

## Changes

1. Bump the vulnerable root dependencies (directly or by lockfile update) to patched versions,
   pinned. *H02-AC-1, H02-AC-4.*
2. In `app/`, run `npx expo install --fix`, add `react-dom` and `expo-asset` at the SDK's versions,
   and remove `newArchEnabled` from `app.json`. *H02-AC-2, H02-AC-3, H02-AC-4.*

## Gate

- **H02-AC-1** — The root workspace has no high or critical production advisory. *Verify:* `npm audit --omit=dev --audit-level=high` at the repository root exits 0 (record the output).
- **H02-AC-2** — `expo-doctor` passes every check in `app/`. *Verify:* `cd app && npx expo-doctor` exits 0 (record the output).
- **H02-AC-3** — The installed `expo` is at least 57.0.9 and `react-native` at least 0.86.2. *Verify:* `cd app && node -p "require('expo/package.json').version + ' ' + require('react-native/package.json').version"` prints versions at or above those.
- **H02-AC-4** — All four CI jobs pass with the new lockfiles. *Verify:* the CI run on the node's PR is green (record the URL).

## Risks

- Fastify and zod minor bumps can change validation error shapes; the backend suite covers the
  routes.
- `expo install --fix` may move `@types/jest` a major version; fix type errors in the app's own code
  only, never by changing tests.
- Advisories change daily. The gate is the state on the day of the PR; record the date.
- `app/` audit findings are not in scope (the audit ran only the root workspace); note any in the PR.
