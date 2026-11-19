# Deploying Ljiljan

This covers taking the `backend` and `voice-agent` services from CI-built
container images to a running deployment on your Kubernetes cluster, against
your own HA Postgres. The `app` (Expo client) is not part of this — it ships
via [EAS Build](https://docs.expo.dev/build/introduction/), not a container.

## 1. How images get built

`.github/workflows/release.yml` runs on every push to `main` and on `v*`
tags. It reuses `.github/workflows/ci.yml`'s full test suite (backend,
content, app, voice-agent) as a gate — **images are only built and pushed if
every package's tests pass** — then builds and pushes two images to GHCR:

| Image | Built from | Context |
|---|---|---|
| `ghcr.io/OWNER/ljiljan-backend` | `backend/Dockerfile` | repo root (needs the workspace lockfile + `content/generated`) |
| `ghcr.io/OWNER/ljiljan-voice-agent` | `voice-agent/Dockerfile` | `voice-agent/` (self-contained) |

(`OWNER` = your GitHub username/org, lowercased — GHCR requires a lowercase
path. The workflow computes this itself; for the manifests, a fork sets its
owner once in `deploy/kustomization.yaml` — see §3.)

Each image gets tagged with: a `sha-<commit>` tag (always), `latest` (pushes
to `main` only), and semver tags (`1.2.3` / `1.2` / `1`, only when the push is
a `v1.2.3`-style tag). Pick whichever tag matches your rollout policy —
`latest` for rolling-with-main, a pinned `v*` tag for a controlled release.

To cut a pinned release: `git tag v0.1.0 && git push origin v0.1.0`.

## 2. Make the GHCR package pullable from your cluster

GHCR packages default to **private** the first time they're pushed. Either:

- **Make the package public** (simplest): on GitHub, go to the package page
  (`https://github.com/users/OWNER/packages/container/ljiljan-backend`, and
  the same for `ljiljan-voice-agent`) → Package settings → Change visibility
  → Public. No pull secret needed; you can drop the `imagePullSecrets:` entry
  from the manifests below (or leave it — an unnecessary pull secret is
  harmless).

- **Or keep it private** and give your cluster a pull secret. Create a
  [classic PAT](https://github.com/settings/tokens) with `read:packages`
  scope, then:
  ```bash
  kubectl create secret docker-registry ghcr-pull-secret \
    --namespace ljiljan \
    --docker-server=ghcr.io \
    --docker-username=OWNER \
    --docker-password=YOUR_PAT
  ```
  (Create the `ljiljan` namespace first — step 3 below — if you do this
  before applying `namespace.yaml`.)

## 3. Apply the manifests

All resources live in the `ljiljan` namespace. From the repo root, apply the
namespace and your filled-in Secret with `kubectl apply -f`, then everything
else with `kubectl apply -k deploy/`. Do not run `kubectl apply -f deploy/` on
the whole folder: it would send `kustomization.yaml` to the API server.

```bash
kubectl apply -f deploy/namespace.yaml
```

The workload manifests carry bare image names (`ljiljan-backend`,
`ljiljan-voice-agent`); `deploy/kustomization.yaml` sets their registry, owner
and tag in its `images:` field. As committed it names this repository's images
(`ghcr.io/tuckermclean/…`) at `latest`, so `kubectl apply -k deploy/` works
as is. A fork sets its own lowercased GitHub owner, either with the standalone
`kustomize` binary, run in `deploy/`:

```bash
cd deploy
kustomize edit set image \
  ljiljan-backend=ghcr.io/<owner>/ljiljan-backend:latest \
  ljiljan-voice-agent=ghcr.io/<owner>/ljiljan-voice-agent:latest
cd ..
```

or by editing `newName:` (and `newTag:`) under `images:` in
`deploy/kustomization.yaml` directly. To roll out a pinned
`sha-<short commit>` tag instead of `latest`, see §6.

### 3a. The secret — your real HA Postgres + API keys

```bash
cp deploy/backend-secret.example.yaml deploy/backend-secret.yaml
$EDITOR deploy/backend-secret.yaml
```

Fill in, at minimum:

- `DATABASE_URL` — your HA Postgres connection string, e.g.
  `postgresql://user:pass@your-ha-postgres-host:5432/ljiljan?sslmode=require`.
  Point this at whatever endpoint your HA setup (Patroni, CloudNativePG,
  RDS Multi-AZ, etc.) exposes as its writer/primary — this app does no
  connection-routing of its own, it just opens one `postgres://` connection
  pool (see `backend/src/db/client.ts`).
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — long random strings of
  at least 32 characters (`openssl rand -base64 48` gives 64).
  **Do not skip this**: see the boot-guard note below.
- `GROQ_API_KEY`, `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`,
  `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` — as needed for the features you
  run (pronunciation grading, voice tutor).

Then:

```bash
kubectl apply -f deploy/backend-secret.yaml
```

`deploy/backend-secret.yaml` is gitignored — the filled-in version with real
credentials must never be committed. Only `deploy/backend-secret.example.yaml`
(placeholders) is tracked.

### 3b. The backend

```bash
kubectl apply -k deploy/
kubectl rollout status -n ljiljan deployment/backend
```

`apply -k` creates the backend Deployment and Service, and also the seed Job
(3c) and the voice-agent Deployment (3d), since `kustomization.yaml` lists them.

The Deployment has liveness + readiness probes on `GET /health` (always
returns `{"ok": true}` once Fastify is listening — see `backend/src/app.ts`)
and modest resource requests/limits you should tune for your workload.

### 3c. Seed the curriculum

The backend image bakes in `content/generated/` (the CEFR curriculum JSON)
and `content/audio-out/manifest.json` (audio URL lookups) — see
`backend/Dockerfile`. Load them into Postgres with a one-shot Job:

The `kubectl apply -k deploy/` above already created the Job `backend-seed`:

```bash
kubectl logs -n ljiljan job/backend-seed -f
```

On a fresh database a first seed attempt can fail, because the backend pods are
creating the schema (§4) at the same moment. That is expected: the Job retries
(`backoffLimit: 2` in `deploy/seed-job.yaml`).

It's idempotent (upserts by id — see `seedCourse()` in
`backend/scripts/seed-course.ts`), so re-run it any time a new image ships
updated content. Delete the completed Job before re-applying
(`kubectl delete job -n ljiljan backend-seed`, then `kubectl apply -k deploy/`),
since a Job's pod template is immutable and Jobs aren't auto-replaced by
`kubectl apply`.

### 3d. The voice-agent worker (optional)

Only needed if you're running the live voice-tutor feature (needs LiveKit +
Groq + Azure — all pulled from the same `backend-secrets` Secret):

`kubectl apply -k deploy/` creates it with the rest. To leave it out, delete the
`voice-agent-deployment.yaml` line from `resources:` in
`deploy/kustomization.yaml` before applying.

It's a worker, not a server — it registers outbound with your LiveKit
project and receives job dispatches over that connection, so there's no
Service/Ingress/probe for it.

### 3e. Ingress (optional)

`deploy/ingress.yaml` is a fully-commented template for exposing the backend
Service externally (nginx-ingress + cert-manager shown as an example).
Uncomment and adapt it to your ingress controller and domain, and uncomment
`- ingress.yaml` under `resources:` in `deploy/kustomization.yaml` (both
together), then `kubectl apply -k deploy/`.

## 4. Schema: how tables get created

The schema comes only from `initSchema()` (see `backend/src/db/client.ts` /
`backend/src/db/ddl.ts`). It runs a set of `CREATE TABLE IF NOT EXISTS`
statements **on every backend boot**, for both PGlite (local/test) and real
Postgres. That's why the Deployment above works against a brand-new database
with zero extra steps: the first pod to start creates the schema, and every
subsequent boot is a no-op against the existing tables.

`initSchema()` never changes an existing table. A change to a column or a
type of an existing table therefore needs a manual step: apply the SQL by
hand (e.g. with `psql` against `DATABASE_URL`) **before** rolling out the
backend image that needs it.

Migrations are planned (drizzle-kit migrations, each applied by its own
step; see `SPEC.md`, OD5) and not built.

## 5. The JWT-secret boot guard

`backend/src/env.ts`'s `assertProductionSecretsAreSafe()` runs first thing in
`main()` (`backend/src/index.ts`) and **refuses to start** if `DATABASE_URL`
is set (i.e. you're not in local/PGlite mode; with it unset the guard does
nothing) and either `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` is unset,
starts with `dev-`, contains `REPLACE_WITH`, or is shorter than 32
characters. This is deliberate: it's the one thing standing between "forgot
to fill in the Secret" and shipping a production deployment with a
world-known JWT signing key. Set each to a long random value, e.g.
`openssl rand -base64 48`. The error names each refused variable and the
reason, never the value. If a pod is crash-looping right after seeing a
real `DATABASE_URL`, check `kubectl logs` for this error first — it means
`deploy/backend-secret.yaml` still has placeholder JWT secrets (or wasn't
applied at all).

## 6. Updating a running deployment

The committed `deploy/kustomization.yaml` uses `latest`, so a rollout doesn't
happen automatically when a new image is pushed. To roll out a specific image,
set both images' tag in `deploy/kustomization.yaml` to `sha-<short commit>`
(the seven-character tag `release.yml` pushes for every build) or to a semver
tag (`1.2.3`), e.g. with `kustomize edit set image
ljiljan-backend=ghcr.io/<owner>/ljiljan-backend:sha-abc1234` in `deploy/` (and
likewise for `ljiljan-voice-agent`), or by editing `newTag:`. Then:

```bash
kubectl delete job -n ljiljan backend-seed --ignore-not-found
kubectl apply -k deploy/
kubectl rollout status -n ljiljan deployment/backend
kubectl rollout status -n ljiljan deployment/voice-agent
```

The completed seed Job goes first because its pod template is immutable, so
`apply -k` would fail on it; applying recreates it with the new image.

A `sha-` or semver tag keeps a restarted pod on the same image. Only with
`latest` is an explicit restart needed to pick up a new push:

```bash
kubectl rollout restart -n ljiljan deployment/backend
kubectl rollout restart -n ljiljan deployment/voice-agent
```
