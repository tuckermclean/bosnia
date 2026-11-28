# D06 — pr-image-build

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | B11, V07, D02 | D07, D08 | S |

**Owns:** `.github/workflows/images.yml`
**Resolves:** #17

## Purpose

No workflow builds the service images on a pull request. `CI` (`.github/workflows/ci.yml`, D01) runs each
package's typecheck and tests and builds no image; `Release` (`.github/workflows/release.yml`, D02) builds and
pushes the images only on a push to `main` or a `v*` tag. A change that breaks `backend/Dockerfile` (B11),
`voice-agent/Dockerfile` (V07) or a file either one copies passes every check on its pull request and fails
only in `Release` after the merge, and from then on `main` produces no new image.

This node adds a third workflow, `.github/workflows/images.yml`, named `Images`, that runs only on pull
requests to `main`. It builds both images exactly as `Release` builds them, with the same Dockerfiles, the
same build contexts and the same GitHub Actions build-cache scopes, but it does not log in to a registry and
does not push (`push: false`). It needs no secret. A push to `main` still builds each image once, in `Release`.

The image jobs live in a workflow of their own, not in `ci.yml`: `ci.yml` is also `Release`'s reusable test
gate (`workflow_call`), and D01's criteria record it as the four package jobs.

## Tests

None: no test reads a workflow, and tests use no Docker (principle 4). The evidence is the workflow's own run
on the pull request that adds it, which GitHub runs from the PR's merge commit; nothing is pushed to GHCR.
The node's PR records, next to the `CI` jobs that `AGENTS.md` asks for, the outcome of each `Images` job of
the run on its head commit and that run's URL.

## Changes

- `.github/workflows/images.yml`: new, the workflow `Images`.
  - `on: pull_request` with `branches: [main]` and no other trigger (no `push`, tag, `workflow_call`,
    `workflow_dispatch` or `schedule`).
  - `permissions: contents: read` and nothing else.
  - A concurrency group per workflow and ref with `cancel-in-progress: true`, as in `ci.yml`, so a newer push
    to the PR cancels the build of the older one.
  - Two jobs on `ubuntu-latest`, one per image, each running `actions/checkout@v4`,
    `docker/setup-buildx-action@v3` and `docker/build-push-action@v6`, the action versions `release.yml` uses:
    - the backend image: `context: .`, `file: backend/Dockerfile`, `push: false`,
      `cache-from: type=gha,scope=backend`, `cache-to: type=gha,mode=max,scope=backend`;
    - the voice-agent image: `context: voice-agent`, `file: voice-agent/Dockerfile`, `push: false`,
      `cache-from: type=gha,scope=voice-agent`, `cache-to: type=gha,mode=max,scope=voice-agent`.
  - No `docker/login-action`, no `docker/metadata-action` (nothing is tagged for a registry), no reference to
    `secrets.` and no `needs:` on `ci.yml`: the image builds run beside `CI`, not after it.
  - Comments, in the style of `release.yml`, that say why the workflow exists, that it never pushes, and that
    the contexts, Dockerfiles and cache scopes must stay in step with `release.yml`.
- `ci.yml` and `release.yml` do not change.

## Gate

- **D06-AC-1** — `.github/workflows/images.yml` runs on pull requests to `main` and on no other event: it has no `push`, tag, `workflow_call`, `workflow_dispatch` or `schedule` trigger, so a push to `main` builds the images only in `Release`. *Verify:* the reviewer reads the workflow's `on:` block; unpinned (no test reads a workflow).
- **D06-AC-2** — The workflow builds the backend image from `backend/Dockerfile` with the repository root as the context, and the voice-agent image from `voice-agent/Dockerfile` with `voice-agent/` as the context, the same files and contexts as `release.yml`, each with `push: false`. *Verify:* the reviewer compares each build step with `release.yml`'s; unpinned.
- **D06-AC-3** — Each build reads and writes the GitHub Actions build cache with `release.yml`'s scope for that image: `backend` for the backend image and `voice-agent` for the voice-agent image. *Verify:* the reviewer compares the `cache-from` and `cache-to` lines with `release.yml`'s; unpinned.
- **D06-AC-4** — The workflow uses no secret and pushes nothing: it references no `secrets.` value, has no `docker/login-action` step, and asks for no permission beyond `contents: read`. *Verify:* the reviewer reads the workflow (`grep -n 'secrets\.\|login-action\|push: true' .github/workflows/images.yml` prints nothing); unpinned.
- **D06-AC-5** — The workflow's run on the node's own pull request builds both images, each job succeeding, and the PR records each `Images` job's outcome and the run's URL. *Verify:* the `Images` run on the PR's head commit, recorded in the PR; unpinned (the workflow's own run, not a test).
- **D06-AC-6** — `ci.yml` and `release.yml` are unchanged, and the four `CI` jobs pass on the node's PR. *Verify:* the reviewer diffs both files with `main`, and the PR's CI evidence records the four jobs.

## Risks

- The failing path is not exercised: no run shows a broken Dockerfile failing the job. `docker/build-push-action`
  exits non-zero when the build fails, which fails the job; the node does not push a broken commit to prove it.
- The check fails a pull request only if the owner makes the `Images` jobs required in the branch protection of
  `main`; until then a red build is visible on the PR but does not block the merge. That is a repository
  setting, not something a node changes.
- Every pull request builds both images, a spec-only PR too, which adds a few minutes of runner time per PR. A
  `paths` filter would skip them, but a required check that is skipped by a path filter never reports and
  would block those PRs.
- The contexts, Dockerfiles and cache scopes are copied from `release.yml`, not shared with it: a later change
  to one workflow that does not change the other lets them drift. The comments in `images.yml` say so.
- A PR's cache writes are kept under the PR's own ref, so `Release` on `main` cannot read them. They speed up
  later pushes to the same PR, and `Release` keeps its own cache.
- The PR build checks only that the images build. It does not run them, so an image that builds but fails to
  start (a missing env var at boot, a wrong `CMD`) still shows up only after a rollout.
- The `docker/*` actions are major tags, not pinned commits, as in `release.yml` (principle 6).
