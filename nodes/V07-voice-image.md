# V07 — voice-image

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | V01, V05 | none | S |

**Owns:** `voice-agent/Dockerfile`, `voice-agent/.dockerignore`

## Purpose

Imported from the code. `voice-agent/Dockerfile` builds the worker's production image with `voice-agent/`
itself as the build context (`docker build voice-agent`), unlike the backend image (B11).

- On `python:3.11-slim`, it installs `requirements.txt` (V01) without a pip cache, copies every `*.py` of the
  folder into `/app`, adds the user `worker` (uid 1000) and runs as it, and starts `python agent.py start`
  (V05). It exposes no port: the worker connects out to the LiveKit server. Keys come at run time from the
  deployment's Secret; none is baked in.
- `voice-agent/.dockerignore` keeps `.venv`, caches and `*.pyc`, `tests`, `.git`, `.github`, logs and `.env`
  files out of the build context.

## Tests

No test builds the image: tests use no Docker (principle 4). The release workflow builds and pushes it to GHCR
on pushes to `main` and on `v*` tags, after the test jobs pass; no workflow builds it on a pull request.

## Changes

none: imported

## Gate

- **V07-AC-1** — Built with `voice-agent/` as the context, the image installs the pinned requirements and starts `python agent.py start` as the non-root user `worker`, with no exposed port. *Verify:* unpinned (the release workflow's build, not a test).
- **V07-AC-2** — The build context holds no tests, virtual environment or `.env` file. *Verify:* unpinned.

## Risks

- A pull request that breaks the image build is not caught: only a push to `main` or a tag builds it.
- `COPY *.py` also copies `latency_probe.py` (V06) into the production image.
- The base image is a tag, not a digest, so a rebuild can pick up a different Python 3.11 patch release.
