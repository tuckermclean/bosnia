# AGENTS.md

## Building a node

- **Building.** Build a node with `/noodlebot:node <ID>`.
- **Authority order.** `SPEC.md`, then `docs/graph.yaml`, then the node spec `nodes/<ID>-<name>.md`, then this
  file. When two disagree, the earlier one wins and the later one is fixed by a spec PR.
- **Roles.** The plugin's tester writes the failing tests, the implementer makes them pass, the reviewer
  judges the result. This repository has no role agents of its own.
- **Spec checkers.** `python3 -I <plugin dir>/skills/node/check-regime.py` and
  `python3 -I <plugin dir>/skills/node/check-coverage.py` from the repository root must print `PROBLEMS 0`
  before a spec PR is opened.
- **Setup.** `npm ci` at the root (the `backend` and `content` workspaces) and `npm ci` in `app/` (its own
  lockfile, not a workspace). The voice-agent tests use the standard library only; CI also runs
  `pip install -r requirements.txt` in `voice-agent/`.
- **Gate command.** The whole suite, run from the repository root:
  `npm test -w @bosanski/backend; b=$?; npm run test -w @bosanski/content; c=$?; (cd app && npx jest); a=$?; (cd voice-agent && python3 -m unittest discover -s tests -t .); v=$?; exit $((b|c|a|v))`.
  CI does not run this command itself: it runs the gate's four test steps on the PR, one job per package
  (`.github/workflows/ci.yml`). Its failure lines are vitest's ` FAIL  <file> > <test>`, jest's
  `  ● <suite> › <test>` and unittest's `FAIL: test_…` / `ERROR: test_…`, which `gate.fail_pattern` in the
  graph matches. The pattern was checked against scratch probe failures in each runner, including a jest test
  outside a `describe` (`  ● <test>`): it matched each probe's failure line and no summary line; it skips
  jest's `Test suite failed to run`, which names no test. The pattern reads uncoloured output: with
  `CI=1 GITHUB_ACTIONS=1` and output not to a terminal, as in CI, vitest's ` FAIL  ` and jest's `  ● ` lines
  carry no colour codes (checked with probes); `FORCE_COLOR` would colour them, so a gate run does not set it.
- **Quick gate.** In a session, run locally the same runners with a list of files: the red targets and the
  test files of what a change touches. They print the same failure lines.
  - backend: `npm test -w @bosanski/backend -- test/<name>.test.ts` (paths relative to `backend/`);
  - content: `npm run test -w @bosanski/content -- test/<name>.test.ts` (paths relative to `content/`);
  - app: `(cd app && npx jest --runTestsByPath <path>)` (paths relative to `app/`; without
    `--runTestsByPath`, jest reads the path as a regular expression, so `app/(tabs)/…` or an `[id]` route
    matches no test);
  - voice-agent: `(cd voice-agent && python3 -m unittest tests.<module>)`.
- **Other checks.** CI also runs, and a node keeps passing: `npm run typecheck -w @bosanski/backend`,
  `npm run typecheck -w @bosanski/content`, `(cd app && npx tsc --noEmit)` and
  `(cd voice-agent && python3 -m py_compile *.py)`. They name no test, so they are not in the gate.
- **Known red.** The graph's `gate.known_red` lists the tests that fail today: none. A failing test that is
  not listed is a failure of the change. A node that fixes a listed test removes it from the list in its own PR.
- **Owns.** A node changes only the files it owns (its `owns` globs) and its direct deps' files, and places
  every file it adds in an area or in a node.
- **Red target.** A command that exits non-zero before the node's change and 0 after, normally the quick gate
  for the node's own test file, e.g. `npm test -w @bosanski/backend -- test/auth.test.ts`, or for an app test
  `(cd app && npx jest --runTestsByPath 'app/(tabs)/__tests__/home.test.tsx')`.
- **Tests and fixtures.** Backend tests are `backend/test/*.test.ts` with the shared `backend/test/helpers.ts`
  (vitest, PGlite, fakes for Groq and LiveKit); content tests are `content/test/*.test.ts` (vitest, a scripted
  fake LLM); app tests are `app/**/__tests__/*.test.ts(x)` (jest-expo); voice-agent tests are
  `voice-agent/tests/test_*.py` (unittest, standard library only). No test uses a key, Docker or the network
  (principle 4). `.noodlebot/roles.yaml` adds `backend/test/**`, `content/test/**` and
  `app/**/__tests__/**` to the role guard's test paths. `content/generated/`, `content/audio-out/` and
  `app/assets/` are out of scope: a node never changes them.
- **Spec files:** `SPEC.md`, `docs/graph.yaml`, `nodes/` (a trailing slash marks a folder); a spec PR changes only these.
- **Porting rules.** None.
- **CI evidence.** In the node's PR, record the outcome of each job of the `CI` workflow run on the PR's head
  commit (backend, content, app, voice-agent), and the red target's output before and after. CI runs Node 22
  and Python 3.11; a local run on other versions is advisory (`SPEC.md`, OD9).
