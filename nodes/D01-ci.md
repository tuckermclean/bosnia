# D01 — ci

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | R01, B01, C01, A01, V01 | D02 | S |

**Owns:** `.github/workflows/ci.yml`

## Purpose

Imported from the code. `.github/workflows/ci.yml` is the `CI` workflow: it runs on pushes and pull requests to
`main`, and other workflows call it (`workflow_call`) as their test gate (D02). A concurrency group per workflow
and ref cancels a run still in progress when a newer one starts.

It has four jobs on `ubuntu-latest`, one per package:

- `backend (typecheck + test)`: Node 22 with the npm cache, `npm ci` at the root (R01), then
  `npm run typecheck -w @bosanski/backend` and `npm test -w @bosanski/backend` (B01);
- `content (typecheck + test)`: the same install, then `npm run typecheck -w @bosanski/content` and
  `npm run test -w @bosanski/content` (C01);
- `app (typecheck + test)`: in `app/`, Node 22 with the npm cache keyed on `app/package-lock.json`, `npm ci`
  there (A01, not a workspace), then `npx tsc --noEmit` and `npx jest`;
- `voice-agent (compile + test)`: in `voice-agent/`, Python 3.11 with the pip cache keyed on
  `requirements.txt` (V01), `pip install -r requirements.txt`, `python -m py_compile *.py` (every module must
  import with no env vars set, principle 5) and `python -m unittest discover -s tests -t .`.

These are the gate's four test steps (`docs/graph.yaml`, `AGENTS.md`) plus the typechecks, the checks a node's
CI evidence records.

## Tests

None: no test reads the workflow. Its own runs on pull requests are the evidence that it works.

## Changes

none: imported

## Gate

- **D01-AC-1** — On a push or pull request to `main`, the workflow runs four jobs, `backend`, `content`, `app` and `voice-agent`, each failing when its package's typecheck (`py_compile` for the voice agent) or tests fail. *Verify:* unpinned (the workflow's own runs, not a test).
- **D01-AC-2** — The backend and content jobs install once at the root with `npm ci`; the app job installs with its own `npm ci` in `app/`; the voice-agent job installs `voice-agent/requirements.txt`. *Verify:* unpinned.
- **D01-AC-3** — The jobs run on Node 22 and Python 3.11 (`SPEC.md`, OD9). *Verify:* unpinned.
- **D01-AC-4** — The workflow can be called by another workflow (`workflow_call`) and then runs the same four jobs. *Verify:* unpinned.
- **D01-AC-5** — The workflow uses no secret and no key (principle 4). *Verify:* unpinned.

## Risks

- `py_compile` checks syntax only: it imports nothing, so it does not catch a module-level side effect that
  needs an env var, though the comment in the workflow says it guards against one.
- The workflow builds no image: a change that breaks `backend/Dockerfile` (B11) or `voice-agent/Dockerfile`
  (V07) passes CI and fails only in the release workflow (D02) after the merge.
- The backend and content jobs each run the full root `npm ci`; nothing is shared between jobs but the npm cache.
- The action versions (`actions/checkout@v4`, `setup-node@v4`, `setup-python@v5`) are major tags, not pinned
  commits, unlike the dependencies (principle 6).
- With `cancel-in-progress`, a newer push to `main` cancels the running check of the previous push.
