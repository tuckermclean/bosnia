# A10 — tests-out-of-routes

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | A01, A07 | R04 | S |

**Owns:** `app/__tests__/home.test.tsx`, `app/__tests__/routes-folder.test.ts`
**Resolves:** #36

## Purpose

A07's home test, `app/app/(tabs)/__tests__/home.test.tsx`, sits under `app/app/`, expo-router's routes
folder. expo-router 57's route context (`expo-router/_ctx-shared.js`, `EXPO_ROUTER_CTX_IGNORE`) takes every
`.js`, `.jsx`, `.ts` and `.tsx` file under that folder as a route, apart from `+api`, `+html` and
`+native-intent` files. Nothing excludes a `__tests__` folder or a `*.test.*` name. So the test file is the
route `(tabs)/__tests__/home.test`. The app and web bundles load it, and its jest imports with it, through the
route context, and the route tree has a route nobody declared.

This node moves the home test to `app/__tests__/home.test.tsx`, outside the routes folder, next to A09's
`app/__tests__/auth-navigation.test.tsx`. Its cases, names, mocks and assertions stay as they are; only its
import of the screen changes. A new app test, `app/__tests__/routes-folder.test.ts`, fails whenever a file
under `app/app/` is a test file or sits in a `__tests__` folder, so a later test cannot land there again. The
example red target in `AGENTS.md` names the old path; it gets the new one.

**Owner's approval.** The home test is frozen: A07-AC-1 to A07-AC-5 and A01-AC-1 name it in their *Verify*.
`AGENTS.md` is a file no node owns. The owner approved this change in their own words, in chat on
2026-11-20, as relayed in the review of this node's spec PR
(<https://github.com/tuckermclean/bosnia/pull/38#pullrequestreview-5996544436>). Asked about "A07's home
test moves from app/app/(tabs)/__tests__/home.test.tsx to app/__tests__/home.test.tsx with a `git mv`, and
only its screen import line changes. A07-AC-1..5 and A01-AC-1 are marked superseded by the new criteria.
AGENTS.md's example red-target line gets the new path.", they answered: "Approve #38 (A10)". The approval
covers three changes and nothing else:
- the move of the home test with `git mv`, with its one changed import line;
- the *Verify* of A07-AC-1 to A07-AC-5 and of A01-AC-1 becoming `superseded by` lines;
- the one-line change to `AGENTS.md`'s example red target.

The node's PR quotes this approval. Nothing else frozen changes.

## Tests

- `app/__tests__/routes-folder.test.ts` (jest-expo, Node's `fs` and `path`, no network). It walks `app/app/`
  from the test file's own folder (`path.join(__dirname, '..', 'app')`), not from the working directory. It
  lists each file path, relative to `app/app/`, with `/` separators. A pure function in the test file flags a
  path when any segment is `__tests__`, or when the file name matches `/\.(test|spec)\.[jt]sx?$/`.
  - **No test in the routes folder.** The flagged files under `app/app/` are an empty list. On failure the
    assertion's output names each flagged path. The case first checks that the walk found `_layout.tsx` and
    `(tabs)/home.tsx`, so a wrong root folder cannot pass with an empty walk.
  - **The rule itself.** The function flags `(tabs)/__tests__/home.test.tsx`, `(tabs)/__tests__/helper.ts`,
    `lesson/[id].test.tsx`, `tutor.spec.ts` and `__tests__/x.tsx`. It does not flag `_layout.tsx`,
    `(tabs)/home.tsx`, `lesson/[id].tsx`, `(auth)/sign-in.tsx`, `tutor.tsx` or `testing.tsx`.
- `app/__tests__/home.test.tsx`: A07's home test, moved. Its five cases keep their names, mocks and
  assertions. Its `import HomeScreen from '../home'` becomes `import HomeScreen from '../app/(tabs)/home'`.

Today the routes-folder case fails, naming `(tabs)/__tests__/home.test.tsx`. The rule cases pass.

## Changes

- `app/__tests__/routes-folder.test.ts`: new, the cases above.
- `app/__tests__/home.test.tsx`: the home test, moved from `app/app/(tabs)/__tests__/home.test.tsx` (a
  `git mv`, so its history follows it), with the one changed import line.
- `app/app/(tabs)/__tests__/`: removed, now empty.
- `AGENTS.md`, the **Red target** bullet: the app example becomes
  `(cd app && npx jest --runTestsByPath __tests__/home.test.tsx)`. The **Tests and fixtures** pattern
  `app/**/__tests__/*.test.ts(x)` and `.noodlebot/roles.yaml`'s `app/**/__tests__/**` already match
  `app/__tests__/`, so they do not change. No other line of `AGENTS.md` changes.
- Spec amendments in the node's PR (the node skill's small amendments for a moved file):
  - A07's `owns` drops `app/app/(tabs)/__tests__/`, which the move leaves matching no file. It is not A07's
    last glob.
  - The *Verify* of A07-AC-1 to A07-AC-5 becomes `superseded by A10-AC-3`, and A01-AC-1's becomes
    `superseded by A10-AC-4`.

`app/package.json`'s jest config (A01), the home screen and every other route do not change.

## Gate

- **A10-AC-1** — No file under `app/app/` is a test file (a name matching `*.test.*` or `*.spec.*` with a `js`, `jsx`, `ts` or `tsx` extension) or sits in a `__tests__` folder. The check finds `_layout.tsx` and `(tabs)/home.tsx` in its walk, and on failure it names each offending path. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/routes-folder.test.ts)` (the routes-folder case), which fails before the move naming `(tabs)/__tests__/home.test.tsx`.
- **A10-AC-2** — The check flags a test file or a file in a `__tests__` folder at any depth under the routes folder, and no ordinary route file, including dynamic routes, groups and a name that merely starts with "test". *Verify:* `(cd app && npx jest --runTestsByPath __tests__/routes-folder.test.ts)` (the rule cases, with the paths listed in Tests).
- **A10-AC-3** — The home test runs from `app/__tests__/home.test.tsx`, and its five cases (A07-AC-1 to A07-AC-5) pass under their current names. The file differs from `app/app/(tabs)/__tests__/home.test.tsx` at the node's base only in the import of the home screen, and `app/app/(tabs)/__tests__/` no longer exists. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/home.test.tsx)`, and the reviewer runs `git diff -M <base> HEAD -- app/` and sees a rename with that one changed line.
- **A10-AC-4** — The app's tests still run under jest with the `jest-expo` preset and resolve the `@/` alias to `app/src/` from outside the routes folder: the moved home test imports `@/hooks/useCourses`, `@/hooks/useProgress` and `@/types/api`, and passes. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/home.test.tsx)`.
- **A10-AC-5** — `AGENTS.md`'s app red target example names `__tests__/home.test.tsx`, and nothing in `AGENTS.md` names `app/(tabs)/__tests__/` any more. No other line of `AGENTS.md` changes. *Verify:* `grep -n "(tabs)/__tests__" AGENTS.md` prints nothing, and the reviewer reads the PR's diff of `AGENTS.md`.
- **A10-AC-6** — After the node's spec amendments (A07's `owns` without `app/app/(tabs)/__tests__/`, A07-AC-1 to A07-AC-5 superseded by A10-AC-3, A01-AC-1 superseded by A10-AC-4), both spec checkers print `PROBLEMS 0`. *Verify:* `python3 -I <plugin dir>/skills/node/check-regime.py` and `python3 -I <plugin dir>/skills/node/check-coverage.py` from the repository root.
- **A10-AC-7** — The app suite and `npx tsc --noEmit` in `app/` pass. *Verify:* `(cd app && npx jest)` and `(cd app && npx tsc --noEmit)`, and CI's app job.

## Risks

- The test is frozen (A07, A01). The owner's approval is the quote in Purpose ("Approve #38 (A10)"), given in
  chat on 2026-11-20 and relayed in the review of this spec PR. It covers the move with its one import line,
  the `superseded by` lines of A07-AC-1 to A07-AC-5 and A01-AC-1, and the one-line `AGENTS.md` change. A
  change beyond these three needs a new approval from the owner. A reviewer who reads "frozen" as "never
  renamed" should find that approval in the node's PR.
- `app/tsconfig.json` sets `types: ["jest"]`, so the TypeScript check may not see Node's types for `fs`,
  `path` and `__dirname` in the routes-folder test. If `npx tsc --noEmit` rejects them, the test file adds
  `/// <reference types="node" />`. `@types/node` is in `app/package-lock.json` only as a dependency of the
  jest packages, not as a direct dev dependency. If that reference does not resolve, the test declares the few
  Node functions it uses itself. `app/tsconfig.json` (A01) does not change.
- The check reads the folder on disk, not git's index. A test file under `app/app/` that git ignores (none
  today) is flagged too. That is intended: expo-router reads the disk.
- The check is a jest test, so it guards only where the app suite runs: locally and in CI's app job. Nothing
  stops a commit that skips CI.
- Nobody has measured the bundle cost of the test route or seen the route in a running app. The move removes
  the cause either way. A web export (`npx expo export --platform web`) before and after, with the bundle's
  size and whether it contains `@testing-library/react-native`, is a post-merge check for the owner to record,
  not a criterion.
- A07's spec still describes its test (Tests, Risks) at the old path. Its criteria are history; the
  `superseded by` lines point to this node.
