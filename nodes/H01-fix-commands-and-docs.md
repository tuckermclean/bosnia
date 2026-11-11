# H01 — fix-commands-and-docs

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | S |

**Owns:** `backend/package.json`, `backend/src/auto-seed.ts`, `backend/scripts/seed-course.ts` (content path only, if it shares the bug), `backend/README.md`, `.env.example`, `content/scripts/seed-a1.ts` (deleted), `content/README.md`, `voice-agent/README.md`, `voice-agent/prompts.py` (comment only), `README.md`, `FOLLOWUPS.md`, root `package.json` (description), `.github/workflows/ci.yml` (backend job: build and boot step)

## Purpose

The audit (`docs/AUDIT.md`, B2, B8, C5, C6, A18, V8, V9) found documented commands that fail and docs
that no longer match the code:

- `npm start` in `backend/` runs `node dist/index.js`, but `tsc` emits `dist/src/index.js`.
- The compiled server resolves its content directory from `dist/src/` to `backend/content`, so a
  compiled server outside Docker never auto-seeds.
- `npm run seed-a1` is documented but has no script; the file `content/scripts/seed-a1.ts`, if run,
  overwrites the A1–B2 blueprint and course with A1 only. The owner chose to delete it.
- Several docs say the curriculum is "A1 only"; A1–B2 is committed.
- `voice-agent/README.md` says a `.venv` already exists (it is gitignored) and points to "the project
  plan", which is not in the repository.
- `AUTO_SEED`, `CONTENT_DIR` and `smoke:groq` are undocumented. Client-side grading (accepted by the
  owner) is undocumented.
- The README calls the product a mobile app; the owner made it a web app.

`db:migrate` and `db:generate` are broken too; B03 fixes them. The "degrade gracefully without keys"
claim becomes true in B01, which owns that wording.

## Tests

Keep every existing test. Add a vitest test for the content-directory resolution of the compiled
server (Change 2), and a CI step that builds and boots the backend with `npm start` (Change 1).
Doc criteria are checked with `grep`. Red target, e.g.
`npm test -w @bosanski/backend -- test/auto-seed.test.ts`.

## Changes

1. `backend/package.json`: `main` and `start` point to `dist/src/index.js`. Add a CI step to the
   backend job that runs `npm run build`, starts `npm start` in the background with no
   `DATABASE_URL`, and polls `GET /health`. *H01-AC-1.*
2. Resolve the default content directory so that both `tsx src/...` and the compiled
   `dist/src/...` find the repository's `content/` (`CONTENT_DIR` still overrides). *H01-AC-2.*
3. Delete `content/scripts/seed-a1.ts` and the `seed-a1` row in `content/README.md`. *H01-AC-3.*
4. Correct "A1 only" in `README.md`, `FOLLOWUPS.md`, `content/README.md` and `backend/README.md`
   (the integration test seeds A1–B2). *H01-AC-4.*
5. `voice-agent/README.md`: replace the `.venv` claim with steps to create one; point "the project
   plan" references (README and `prompts.py` comment) to `SPEC.md`. *H01-AC-5.*
6. Document `AUTO_SEED` and `CONTENT_DIR` (backend README and `.env.example`) and the `smoke:groq`
   script (backend README). *H01-AC-6.*
7. Document client-side grading in `backend/README.md`: lesson payloads carry answers and
   `lesson-complete` trusts `correctCount`, capped at the lesson's exercise count. *H01-AC-7.*
8. `README.md` and the root `package.json` description call Ljiljan a web app; `FOLLOWUPS.md` says
   at the top that `SPEC.md` and `docs/graph.yaml` are now the plan. *H01-AC-8.*

## Gate

- **H01-AC-1** — After `npm run build -w @bosanski/backend`, `npm start -w @bosanski/backend` boots the compiled server and `GET /health` answers 200 `{"ok":true}`. *Verify:* the new step in CI's backend job passes on the node's PR (record the run URL).
- **H01-AC-2** — The compiled server, started from a clone with no `DATABASE_URL` and no `CONTENT_DIR`, auto-seeds from the repository's `content/` directory. *Verify:* a vitest test checks that the default content directory resolved for a module under `backend/dist/src/` is the repository's `content/`, and the CI boot step's log contains `auto-seeded course`.
- **H01-AC-3** — `content/scripts/seed-a1.ts` no longer exists and no doc mentions `seed-a1`. *Verify:* `test ! -e content/scripts/seed-a1.ts && ! grep -n "seed-a1" README.md content/README.md backend/README.md FOLLOWUPS.md DEPLOY.md` exits 0.
- **H01-AC-4** — No doc says the curriculum is A1 only. *Verify:* `! grep -rniE "A1[ -]only|seeded A1 content" README.md FOLLOWUPS.md content/README.md backend/README.md` exits 0.
- **H01-AC-5** — `voice-agent/README.md` no longer claims a `.venv` exists and gives the commands to create one; no file refers to "the project plan". *Verify:* `! grep -rn "already exists at\|project plan" voice-agent/` exits 0 and `grep -n "python3.11 -m venv" voice-agent/README.md` finds the step.
- **H01-AC-6** — `AUTO_SEED` and `CONTENT_DIR` are documented in `backend/README.md` and `.env.example`, and `smoke:groq` in `backend/README.md`. *Verify:* `grep -q AUTO_SEED backend/README.md && grep -q AUTO_SEED .env.example && grep -q CONTENT_DIR backend/README.md && grep -q CONTENT_DIR .env.example && grep -q smoke:groq backend/README.md` exits 0.
- **H01-AC-7** — `backend/README.md` states that grading is client-side and the server trusts `correctCount` up to the lesson's exercise count. *Verify:* `grep -n "correctCount" backend/README.md` finds the paragraph.
- **H01-AC-8** — `README.md` and the root `package.json` describe a web app, and `FOLLOWUPS.md` points to `SPEC.md` and `docs/graph.yaml`. *Verify:* `grep -qi "web app" README.md && ! grep -qi "mobile app" package.json && grep -q "docs/graph.yaml" FOLLOWUPS.md` exits 0.

## Risks

- Moving the content directory resolution must not break the Docker image, which sets
  `CONTENT_DIR=/app/content`; the existing auto-seed tests and the CI release build cover it.
- `backend/README.md` is also edited by B01, B02 and B03; keep this node's edits to its own sections.
