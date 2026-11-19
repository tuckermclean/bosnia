# D04 — deploy-guide

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B02, B03, D02, D03 | B12, B13 | S |

**Owns:** `DEPLOY.md`

## Purpose

Imported from the code. `DEPLOY.md` is the operator's guide from the CI-built images to a running deployment on
a Kubernetes cluster against the operator's own Postgres; the app is out of it (it ships through EAS).

1. How images are built: the release workflow (D02), gated on `ci.yml`, pushes `ljiljan-backend` and
   `ljiljan-voice-agent` to GHCR with `sha-<commit>`, `latest` and semver tags; a `v*` tag cuts a pinned release.
2. Making the GHCR packages pullable: make them public, or create the `ghcr-pull-secret` pull secret with a
   `read:packages` token.
3. Applying the manifests (D03) in order: the namespace; the Secret, copied from the example and filled in
   (`DATABASE_URL`, the JWT secrets, the Groq, LiveKit and Azure keys), never committed; replacing `OWNER` in
   the image references; the backend Deployment and Service; the seed Job (idempotent upserts, deleted before a
   re-run); the optional voice-agent worker; the optional, commented-out Ingress.
4. The schema: `initSchema()` (B03) creates missing tables on every backend boot, so a fresh database needs no
   migration step, but it does not change existing tables; drizzle-kit migrations are named as the
   production path, with their wiring as the gap.
5. The JWT boot guard (B02): with `DATABASE_URL` set, the backend refuses to start when either JWT secret is
   missing or starts with `dev-`; a crash-looping pod should be checked for it first.
6. Updating a running deployment: `kubectl rollout restart` for `latest`, or `kubectl set image` to a
   `sha-<commit>` or semver tag.

## Tests

None: no test reads `DEPLOY.md`.

## Changes

none: imported

## Gate

- **D04-AC-1** — `DEPLOY.md` describes the image build and its tags, GHCR access, the order in which the manifests are applied, the Secret's settings, the seed Job, the schema on boot, the JWT boot guard and how to roll out a new image. *Verify:* unpinned.
- **D04-AC-2** — It tells the operator never to commit the filled-in Secret and to replace `OWNER` in the image references before applying. *Verify:* unpinned.

## Risks

- It documents `npm run db:migrate -w @bosanski/backend` as applying migrations, but the script runs
  `src/db/migrate.ts`, which does not exist, and there is no `drizzle.config.ts` (`SPEC.md`, Known gaps; OD5).
- It says the boot guard catches "forgot to fill in the Secret", but the template's `REPLACE_WITH_...`
  placeholders do not start with `dev-`, so the guard lets them through (D03).
- It says the voice agent's settings all come from `backend-secrets`, but the Secret template lacks the keys
  of the non-default STT and LLM providers and the turn-logging settings (D03).
- The guide calls the product Ljiljan and the images `ljiljan-*`, while the packages are `@bosanski/*`.
- It describes the code but no test ties it to it, so it goes stale silently when a node changes the workflows,
  the manifests or the backend's boot.
