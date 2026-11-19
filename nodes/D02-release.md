# D02 — release

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | D01, B11, V07 | D03, D04 | S |

**Owns:** `.github/workflows/release.yml`

## Purpose

Imported from the code. `.github/workflows/release.yml` is the `Release` workflow: on every push to `main` and on
`v*` tags it builds and pushes the two service images to GHCR, with `contents: read` and `packages: write`.

- The `test` job calls `ci.yml` (D01): both image jobs need it, so no image is built unless the four packages'
  checks pass.
- `build-backend` lowercases the repository owner (GHCR needs a lowercase path), tags the image
  `ghcr.io/<owner>/ljiljan-backend` with `docker/metadata-action` (`sha-<short commit>` always, `latest` on the
  default branch, and `<major>.<minor>.<patch>`, `<major>.<minor>`, `<major>` on a semver tag), logs in to
  `ghcr.io` with the workflow's `GITHUB_TOKEN`, and builds `backend/Dockerfile` (B11) with the repository root
  as the context, pushing it, with a GitHub Actions build cache scoped `backend`.
- `build-voice-agent` does the same for `ghcr.io/<owner>/ljiljan-voice-agent` from `voice-agent/Dockerfile`
  (V07), with `voice-agent/` as the context and the cache scoped `voice-agent`.

The app is not built here: it ships through EAS, not as a container.

## Tests

None: no test reads the workflow, and tests use no Docker (principle 4). Its runs on `main` and on tags are the
only evidence; it never runs on a pull request.

## Changes

none: imported

## Gate

- **D02-AC-1** — On a push to `main` or a `v*` tag, the workflow runs `ci.yml` first and builds no image when it fails. *Verify:* unpinned (the workflow's own runs, not a test).
- **D02-AC-2** — It pushes `ghcr.io/<owner>/ljiljan-backend`, built from `backend/Dockerfile` with the repository root as the context, and `ghcr.io/<owner>/ljiljan-voice-agent`, built from `voice-agent/Dockerfile` with `voice-agent/` as the context, `<owner>` being the repository owner in lowercase. *Verify:* unpinned.
- **D02-AC-3** — Each image is tagged `sha-<short commit>` (the commit's first 7 hex digits); a push to the default branch adds `latest`; a semver tag `vX.Y.Z` adds `X.Y.Z`, `X.Y` and `X`. *Verify:* unpinned.
- **D02-AC-4** — It logs in to GHCR with the workflow's own `GITHUB_TOKEN` and asks for no permission beyond `contents: read` and `packages: write`. *Verify:* unpinned.

## Risks

- It runs only after a merge or a tag: a pull request that breaks an image build is not caught (B11, V07).
- A push to `main` runs the four test jobs twice, once in `CI` and once in this workflow's `test` job.
- The deployments pin `latest` (D03), so a new image reaches the cluster only on a manual rollout restart.
- The `docker/*` actions are major tags, not pinned commits (principle 6).
- The release does not seed the database: a content change needs the seed Job run by hand (D03, D04).
