# B14 — start-script

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | B01, B11 | none | S |

**Owns:** `backend/test/start-script.test.ts`
**Resolves:** #21

## Purpose

`backend/package.json` (B01) runs `start` as `node dist/index.js` and sets `main` to `dist/index.js`. But
`backend/tsconfig.json` (B01) compiles with `outDir` `dist` and `rootDir` `.`, so `npm run build -w @bosanski/backend`
writes the server entrypoint `src/index.ts` to `dist/src/index.js`, and `dist/index.js` never exists:
`npm start -w @bosanski/backend` fails on a missing file. `backend/README.md` already documents `npm start` as
running `node dist/src/index.js`. The production image is not affected: `backend/Dockerfile` (B11) runs
`CMD ["node", "backend/dist/src/index.js"]`.

This node points `start` and `main` at `dist/src/index.js`. A backend test then keeps the three in step: it
derives the compiled entrypoint from `src/index.ts` and the `outDir` and `rootDir` of `backend/tsconfig.json`, and
checks that `start` runs it, that `main` names it, and that the Dockerfile's `CMD` runs the same file under the
image's `backend/` folder. The test needs no build, no database and no network.

## Tests

`backend/test/start-script.test.ts` (vitest, no key, no database, no network, no build). It reads
`backend/package.json`, `backend/tsconfig.json` and `backend/Dockerfile` from the repository, with paths resolved
from the test file's own location. `backend/tsconfig.json` is plain JSON today; the test parses it with
`JSON.parse`.

- **The mapping.** A function, local to the test file, that takes a source path relative to the package folder
  (`src/index.ts`), an `outDir` and a `rootDir`, and returns the path `tsc` emits it at, relative to the package
  folder: the source's path relative to `rootDir`, under `outDir`, with `.ts` replaced by `.js`. Cases on inline
  values check it: `rootDir` `.` with `outDir` `dist` gives `dist/src/index.js`; `rootDir` `src` with `outDir`
  `dist` gives `dist/index.js`; `rootDir` `./` and `outDir` `./build/` give `build/src/index.js`.
- **The package.** With `outDir` and `rootDir` read from `backend/tsconfig.json`'s `compilerOptions` (a missing
  one fails the test, naming the option), the entrypoint is the mapping of `src/index.ts`, and the file
  `backend/src/index.ts` exists. `scripts.start` is exactly `node <entrypoint>`, and `main` is exactly
  `<entrypoint>`. A failure names the expected and the actual value.
- **The image.** The last `CMD` instruction of `backend/Dockerfile`, in its exec form (a JSON array), is
  `["node", "backend/<entrypoint>"]`. A Dockerfile with no `CMD`, or whose last `CMD` is in shell form, fails
  the test with that reason.

Today the package case fails: `start` is `node dist/index.js` and `main` is `dist/index.js`. The mapping and image
cases pass.

## Changes

- `backend/package.json`: `scripts.start` becomes `node dist/src/index.js` and `main` becomes
  `dist/src/index.js`. Every other script, field and dependency stays as it is.
- `backend/test/start-script.test.ts`: new, the cases above.

## Gate

- **B14-AC-1** — `backend/package.json`'s `start` script is `node dist/src/index.js` and its `main` is `dist/src/index.js`, and nothing else in the file changes. *Verify:* `npm test -w @bosanski/backend -- test/start-script.test.ts`, and the reviewer diffs `backend/package.json` with `main`.
- **B14-AC-2** — The compiled entrypoint the test derives from `src/index.ts` and `backend/tsconfig.json`'s `outDir` and `rootDir` equals the `start` script's path and `main`, and the test fails, naming the expected and actual values, when they differ. *Verify:* `npm test -w @bosanski/backend -- test/start-script.test.ts`.
- **B14-AC-3** — The last `CMD` of `backend/Dockerfile` runs `node` on the same entrypoint under `backend/`, in exec form, and the test fails when it does not. *Verify:* `npm test -w @bosanski/backend -- test/start-script.test.ts`.
- **B14-AC-4** — The test's mapping, run on inline values, gives `dist/src/index.js` for `rootDir` `.` and `outDir` `dist`, `dist/index.js` for `rootDir` `src`, and `build/src/index.js` for `rootDir` `./` and `outDir` `./build/`. *Verify:* `npm test -w @bosanski/backend -- test/start-script.test.ts`.
- **B14-AC-5** — The backend suite and `npm run typecheck -w @bosanski/backend` pass. *Verify:* `npm test -w @bosanski/backend`, and CI's backend job runs the typecheck.

## Risks

- The test reads `outDir` and `rootDir` only from `backend/tsconfig.json`, not from `../tsconfig.base.json` (R01),
  which it extends. If they move to the base config, the test fails on the missing option instead of following
  `extends`.
- `JSON.parse` fails on a `tsconfig.json` with comments or trailing commas, which `tsc` accepts. Today the file
  has neither.
- The image case parses only the exec form of `CMD`, and only the last `CMD` of the file (the runtime stage's).
  An `ENTRYPOINT` that wraps the command, or a shell-form `CMD`, would need the test changed.
- Nothing runs the compiled server: the test checks paths, not that `npm start` boots. `build` also compiles
  `test/` into `dist/` (B01, Risks).
- B13 also changes `backend/package.json` (it removes `db:migrate` and `db:generate`). The two nodes change
  different lines, so their PRs can conflict only in nearby lines.
