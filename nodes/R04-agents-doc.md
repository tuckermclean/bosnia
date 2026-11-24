# R04 — agents-doc

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | R02, B01, A10 | none | S |

**Owns:** `AGENTS.md`, `backend/test/agents-doc.test.ts`
**Resolves:** #41

## Purpose

`AGENTS.md`'s "Building a node" section tells a session which tests to run locally, and none of its commands
bounds the test runner's workers. jest-expo starts one worker per spare CPU by default, and vitest's pool sizes
itself to the CPUs too. The loop's sessions share one small machine (4 CPUs, 7.6 GiB), so two unbounded runs at
once can exhaust its memory: a whole app jest suite with `--no-cache` or a vitest pin and mutation check is
enough. The section also does not say that a session runs single test files, not whole suites, and it does not
say where a pin's or mutation check's mutant is applied. Today a mutant is applied in the node's own worktree,
so a run killed between applying and reverting it leaves the mutant there.

This node changes the section so that it bounds the local runs and moves mutants out of the node's worktree:

- the quick-gate and red-target commands for vitest (backend, content) and jest (app) pass `--maxWorkers=2`, and
  none passes `--no-cache`;
- a **Local runs.** bullet says that a session runs single test files locally, never a whole suite or
  `gate.command`, and that CI runs the suites;
- a **Mutation and pin checks.** bullet says that each mutant is applied and run in a scratch copy of the
  worktree, never in the node's own worktree.

In the same change, `AGENTS.md` joins the **Spec files:** line, so later `AGENTS.md` fixes go through ordinary
spec PRs. That line then agrees with the authority-order bullet, which already says a lower document "is fixed
by a spec PR". `gate.command` in `docs/graph.yaml` and the CI workflow stay as they are: CI runs the suites on
its own runners. A backend test reads `AGENTS.md` and checks the commands and the lines this node sets, the way
B14 and D05 check the files they own.

## Tests

`backend/test/agents-doc.test.ts` (vitest; no key, no database, no network). It reads `AGENTS.md` and
`docs/graph.yaml` from the repository root, with paths resolved from the test file's own location, and parses
the graph with the `yaml` package already among the backend's devDependencies.

- **The section.** A function local to the test file returns the "## Building a node" section of `AGENTS.md`
  (up to the next `## ` heading) as its top-level bullets, keyed by the bold label each one starts with
  (`Quick gate.`, `Red target.`, `Spec files:`, …), each with its text and sub-bullets. Another local function
  returns a text's inline code spans, joining a span that wraps onto the next line with one space, as Markdown
  renders it. Cases on inline sample text check both. A missing bullet fails the test,
  naming the label.
- **Quick gate.** The first code span of each sub-bullet of the **Quick gate.** bullet is exactly:
  - backend: `npm test -w @bosanski/backend -- --maxWorkers=2 test/<name>.test.ts`;
  - content: `npm run test -w @bosanski/content -- --maxWorkers=2 test/<name>.test.ts`;
  - app: `(cd app && npx jest --maxWorkers=2 --runTestsByPath <path>)`;
  - voice-agent: `(cd voice-agent && python3 -m unittest tests.<module>)`, which stays as it is, since unittest
    runs in one process.
  A failure names the package and the expected and actual span.
- **Bounded commands.** In the **Quick gate.**, **Red target.** and **Mutation and pin checks.** bullets, every
  code span that runs vitest or jest (one containing `npm test -w`, `npm run test -w`, `npx vitest` or
  `npx jest`) contains `--maxWorkers=2` and names a test file: a `<…>` placeholder or a path ending in
  `.test.ts` or `.test.tsx`. No code span in these bullets contains `--no-cache`. A failure names the bullet and
  the span.
- **Red target.** The **Red target.** bullet's code spans include exactly these two examples:
  `npm test -w @bosanski/backend -- --maxWorkers=2 test/auth.test.ts` and
  `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/home.test.tsx)`. No code span in it names
  `app/(tabs)/__tests__/`. A failure names the missing example or the offending span.
- **Local runs.** A **Local runs.** bullet exists and contains `--maxWorkers=2`, `--no-cache`, `gate.command` and
  `CI`.
- **Mutation and pin checks.** A **Mutation and pin checks.** bullet exists and contains `scratch` and
  `pin-<n>.patch`.
- **Spec files.** The code spans on the `**Spec files:**` line itself (the line `check-spec-diff.py` reads, not
  the line that follows it) are exactly `SPEC.md`, `docs/graph.yaml`, `nodes/` and `AGENTS.md`, in that order.
- **Gate command.** The first code span of the **Gate command.** bullet equals `gate.command` in
  `docs/graph.yaml`, and contains no `--maxWorkers`.

Today the quick-gate, bounded-command, red-target, local-runs, mutation and spec-files cases fail, and the
gate-command case passes.

## Changes

- `AGENTS.md`, its "Building a node" section:
  - **Quick gate.**: the backend, content and app commands become the three above. The voice-agent command and
    the `--runTestsByPath` note stay.
  - **Red target.**: the two examples become
    `npm test -w @bosanski/backend -- --maxWorkers=2 test/auth.test.ts` and
    `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/home.test.tsx)`. The app example names the
    home test where A10 moved it, so R04 adds only `--maxWorkers=2` to the line A10 set.
  - **Local runs.** (new, after **Quick gate.**): a session runs single test files locally, the quick gate's
    red targets and the test files of what the change touches, never a package's whole suite and never
    `gate.command`. The suites run in CI, one job per package (`.github/workflows/ci.yml`), whose settings are
    unchanged. Every local vitest or jest run passes `--maxWorkers=2`, and no local run passes `--no-cache`,
    because the loop's sessions share one small machine and an unbounded runner starts a worker per CPU.
  - **Mutation and pin checks.** (new, after **Local runs.**): each mutant, a pin's `out/node/<ID>/pin-<n>.patch`
    or any other mutation check, is applied and run in a scratch copy of the node's worktree outside it, never
    in the node's own worktree, so a run killed midway leaves no mutant in the worktree. The bullet says how the
    copy is made with the installs the tests need (`node_modules` at the root and in `app/`), that its test runs
    are the quick gate's bounded commands, and that the copy is removed afterwards.
  - **Spec files:** the line becomes ``- **Spec files:** `SPEC.md`, `docs/graph.yaml`, `nodes/`, `AGENTS.md` ``,
    on one line, and the note on the next line stays.
  - Nothing else changes: the authority-order, gate-command and other bullets stay as they are.
- `backend/test/agents-doc.test.ts`: new, the cases above.

## Gate

- **R04-AC-1** — The quick gate's backend command is `npm test -w @bosanski/backend -- --maxWorkers=2 test/<name>.test.ts`, its content command `npm run test -w @bosanski/content -- --maxWorkers=2 test/<name>.test.ts` and its app command `(cd app && npx jest --maxWorkers=2 --runTestsByPath <path>)`. The voice-agent command is unchanged. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/agents-doc.test.ts`.
- **R04-AC-2** — In the **Quick gate.**, **Red target.** and **Mutation and pin checks.** bullets, every command that runs vitest or jest passes `--maxWorkers=2` and names a test file, and none passes `--no-cache`. The red-target examples are `npm test -w @bosanski/backend -- --maxWorkers=2 test/auth.test.ts` and `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/home.test.tsx)`, and no code span in the **Red target.** bullet names `app/(tabs)/__tests__/`. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/agents-doc.test.ts`.
- **R04-AC-3** — A **Local runs.** bullet says that a session runs single test files locally, never a package's whole suite and never `gate.command`; that CI runs the suites, with its settings unchanged; that every local vitest or jest run passes `--maxWorkers=2`; and that no local run passes `--no-cache`. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/agents-doc.test.ts` checks that the bullet exists and names these, and the reviewer reads it.
- **R04-AC-4** — A **Mutation and pin checks.** bullet says that each mutant (a pin's `out/node/<ID>/pin-<n>.patch` or any other mutation check) is applied and run only in a scratch copy of the node's worktree, outside it, never in the node's own worktree, so a killed run leaves no mutant there. It says how the copy gets the installs its tests need, that its runs use the quick gate's bounded commands, and that the copy is removed afterwards. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/agents-doc.test.ts` checks that the bullet exists; the PR records one run of the bullet's steps with a scratch mutant, after which `git status --porcelain` in the node's worktree prints nothing; and the reviewer reads the bullet.
- **R04-AC-5** — The `**Spec files:**` line lists `SPEC.md`, `docs/graph.yaml`, `nodes/` and `AGENTS.md` on the line itself. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/agents-doc.test.ts`, and `python3 -I <plugin dir>/skills/node/check-spec-diff.py HEAD HEAD`, run on the node's head, prints `spec files: SPEC.md docs/graph.yaml nodes/ AGENTS.md`.
- **R04-AC-6** — The **Gate command.** bullet still equals `gate.command` in `docs/graph.yaml`, and the node changes neither `docs/graph.yaml`, `.github/workflows/ci.yml` nor any package's `test` script. Apart from the bullets of R04-AC-1 to R04-AC-5, `AGENTS.md` is unchanged. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/agents-doc.test.ts`, and the reviewer runs `git diff --stat origin/main...HEAD`, which lists `AGENTS.md` and `backend/test/agents-doc.test.ts` and no other file outside `nodes/R04-agents-doc.md`, and reads the `AGENTS.md` diff.
- **R04-AC-7** — The backend suite and `npm run typecheck -w @bosanski/backend` pass. *Verify:* CI's backend job on the PR's head commit.

## Risks

- With `AGENTS.md` on the **Spec files:** line, a later spec PR may change it, while R04's test pins its
  commands. A spec PR that changes a pinned command makes the backend suite fail until a node updates the test.
  The test pins only the commands and the bullets this node sets, not the prose around them.
- `check-spec-diff.py` reads the **Spec files:** line from the base commit, so the new entry takes effect for
  spec PRs only once R04 is on `main`. R04 itself is a node PR, built with `/node`, and needs no spec-diff
  exemption.
- A10 tests-out-of-routes moved the home test and set the same **Red target.** line to
  `(cd app && npx jest --runTestsByPath __tests__/home.test.tsx)`, and A10-AC-5 requires that nothing in
  `AGENTS.md` names `app/(tabs)/__tests__/`. R04's app example keeps A10's path and adds only `--maxWorkers=2`,
  and A10 is among R04's Deps, so R04 is built on A10's line and never writes back the old path.
- `--maxWorkers=2` bounds each run, not the machine: several sessions can still run at once. It also makes a
  local run of many files slower than the default.
- A scratch copy of the worktree needs the installs to run the tests: a `git worktree add` has no
  `node_modules`, so the copy either runs `npm ci` at the root and in `app/` (time and disk) or copies the
  installs. The bullet picks one and says so.
- The test checks that the new bullets exist and name their key terms, not that their prose is right; the
  reviewer reads them.
- The noodlebot plugin's node skill applies `pin-<n>.patch` in the node's worktree. This bullet and the skill
  differ until the plugin's own change, a separate change in the noodlebot repository, lands.
