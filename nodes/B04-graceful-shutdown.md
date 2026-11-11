# B04 — graceful-shutdown

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | S |

**Owns:** `backend/src/index.ts`, `backend/src/shutdown.ts` (new, if a seam helps), `backend/README.md` (one line)

## Purpose

The backend has no signal handler: the built image ignores SIGTERM and is killed after the grace
period (`docs/AUDIT.md`, B7). On every rollout, Kubernetes sends SIGTERM to the old pods, so
in-flight requests are cut and the database pool is never closed.

## Tests

A vitest test that spawns the server (`tsx src/index.ts`, no `DATABASE_URL`, a free `PORT`), waits for
`/health`, sends the signal and checks the exit. Red target:
`npm test -w @bosanski/backend -- test/shutdown.test.ts`.

## Changes

1. On SIGTERM or SIGINT: stop accepting connections and wait for in-flight requests (`app.close()`),
   close the database handle, exit 0; if that takes longer than 10 seconds, exit 1. *B04-AC-1,
   B04-AC-2.*
2. One line in `backend/README.md` on shutdown behaviour. *B04-AC-3.*

## Gate

- **B04-AC-1** — A running server that receives SIGTERM exits with code 0 within 5 seconds. *Verify:* a vitest test that spawns the server, waits for `GET /health` 200, sends SIGTERM and awaits the exit code.
- **B04-AC-2** — The same holds for SIGINT. *Verify:* the same vitest test with SIGINT.
- **B04-AC-3** — `backend/README.md` states that the server shuts down cleanly on SIGTERM. *Verify:* `grep -n "SIGTERM" backend/README.md` finds the line.

## Risks

- Spawning the server in a test costs a few seconds (auto-seed runs on an empty in-memory DB); set
  `AUTO_SEED=false` in the test.
- `backend/src/index.ts` is also changed by B03 and W02.
