# AGENTS.md

Guidance for coding agents working in this repository. The product, principles and plan are in
`SPEC.md`; the evidence behind them is in `docs/AUDIT.md`.

## Building a node

Build a node with `/noodlebot:node <ID>` (e.g. `/noodlebot:node H01`). One node per branch
`node/<ID>-<name>`, from `main`; spec changes go on `spec/<topic>`. The owner merges.

**Authority order.** `SPEC.md`, then `docs/graph.yaml`, then the node spec `nodes/<ID>-<name>.md`,
then this file. Where they disagree, stop and ask; do not pick one.

**Role agents.** This repository has none of its own: use the plugin's tester, implementer and
reviewer (`noodlebot:tester`, `noodlebot:implementer`, `noodlebot:reviewer`). The role guard reads
`.noodlebot/roles.yaml` for the test and spec paths.

**Spec checker.** `python3 -I <plugin dir>/skills/node/check-regime.py` from the repository root
must print `PROBLEMS 0` before a node starts and after any spec amendment.

**Preconditions.** Every node in the node's `deps` is merged. Every open decision the node lists
(`decisions` in the graph, the table in `SPEC.md`) is settled, or the owner said to take its default.

**Commands.** Node 22 and Python 3.11, as in CI. Install with `npm ci` at the root (backend and
content workspaces) and `npm ci` in `app/` (its own lockfile).

| What | Command |
|---|---|
| backend typecheck | `npm run typecheck -w @bosanski/backend` |
| backend tests (vitest, PGlite, no Docker) | `npm test -w @bosanski/backend` |
| content typecheck | `npm run typecheck -w @bosanski/content` |
| content tests (vitest, MockProvider, no keys) | `npm run test -w @bosanski/content` |
| content validation | `npm run validate -w @bosanski/content` |
| app typecheck | `cd app && npx tsc --noEmit` |
| app tests (jest, jest-expo) | `cd app && npx jest` |
| voice-agent compile | `cd voice-agent && python3 -m py_compile *.py` |
| voice-agent tests (unittest) | `cd voice-agent && python3 -m unittest discover -s tests -t .` |

The quick test gate is the typecheck and test commands of every package the node touches. There is
no lint configuration (no ESLint, Prettier or ruff) and no workflow linter; a node that touches
`.github/workflows/*` checks that the YAML parses and records the CI run. Root `npm test` runs only
the backend.

**Red target.** One command that exits non-zero before the node's change and 0 after, run from the
repository root, for example:
`npm test -w @bosanski/backend -- test/<file>.test.ts`,
`npm run test -w @bosanski/content -- test/<file>.test.ts`,
`cd app && npx jest <path to test>`,
`cd voice-agent && python3 -m unittest tests.<module>`.
Failures must be reported by the test runner as failing tests, not as a crash of the runner.

**Test and fixture paths** (frozen once a RED commit adds them): `backend/test/**` (including
`helpers.ts`), `content/test/**`, `app/**/__tests__/**`, any `*.test.ts(x)`, `voice-agent/tests/**`,
and the guard's defaults (`**/tests/**`, `**/fixtures/**`, …). `content/generated/` and
`content/audio-out/` are application data, not fixtures: tests never write there; they copy what
they need into a temporary directory.

**Porting rules.** None: nothing is ported from a predecessor.

**Traps.**
- Tests and local runs need no Docker and no keys (`SPEC.md`, principle 4). Use the fakes in
  `backend/test/helpers.ts`; never call Groq, Azure, LiveKit or an LLM from a test.
- `backend/src/env.ts` parses `process.env` at import time; pass settings into `buildApp` or the
  function under test instead of mutating the environment in tests.
- Voice-agent modules must import with zero environment variables (principle 5).
- Web-only code goes in `*.web.ts(x)` files so native-only modules stay out of the web bundle.

**CI evidence.** Every push and PR to `main` runs `.github/workflows/ci.yml` (backend, content, app,
voice-agent jobs). Criteria that need a build, a boot, an image or GitHub are verified there: record
the run URL, the job names and their result in the PR's criterion → evidence table. Release
(`release.yml`) runs only on `main` and tags; a criterion about it is checked statically in the PR
and the first release run after merge is recorded as a follow-up.
