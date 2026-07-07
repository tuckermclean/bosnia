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
path. The workflow computes this itself; the manifests below need you to
substitute it in by hand.)

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

All resources live in the `ljiljan` namespace. From the repo root:

```bash
kubectl apply -f deploy/namespace.yaml
```

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
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — long random strings
  (`openssl rand -base64 48`). **Do not skip this**: see the boot-guard note
  below.
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

**Important — replace `OWNER` in the image references** before applying the
deployments: `deploy/backend-deployment.yaml`, `deploy/seed-job.yaml`, and
`deploy/voice-agent-deployment.yaml` all reference
`ghcr.io/OWNER/ljiljan-*:latest` literally — swap in your lowercased
GitHub owner (or `sed -i "s/OWNER/your-owner/" deploy/*.yaml`).

### 3b. The backend

```bash
kubectl apply -f deploy/backend-deployment.yaml
kubectl apply -f deploy/backend-service.yaml
kubectl rollout status -n ljiljan deployment/backend
```

The Deployment has liveness + readiness probes on `GET /health` (always
returns `{"ok": true}` once Fastify is listening — see `backend/src/app.ts`)
and modest resource requests/limits you should tune for your workload.

### 3c. Seed the curriculum

The backend image bakes in `content/generated/` (the CEFR curriculum JSON)
and `content/audio-out/manifest.json` (audio URL lookups) — see
`backend/Dockerfile`. Load them into Postgres with a one-shot Job:

```bash
kubectl apply -f deploy/seed-job.yaml
kubectl logs -n ljiljan job/backend-seed -f
```

It's idempotent (upserts by id — see `seedCourse()` in
`backend/scripts/seed-course.ts`), so re-run it any time a new image ships
updated content. Delete the completed Job before re-applying it
(`kubectl delete job -n ljiljan backend-seed`), since Jobs aren't
auto-replaced by `kubectl apply`.

### 3d. The voice-agent worker (optional)

Only needed if you're running the live voice-tutor feature (needs LiveKit +
Groq + Azure — all pulled from the same `backend-secrets` Secret):

```bash
kubectl apply -f deploy/voice-agent-deployment.yaml
```

It's a worker, not a server — it registers outbound with your LiveKit
project and receives job dispatches over that connection, so there's no
Service/Ingress/probe for it.

### 3e. Ingress (optional)

`deploy/ingress.yaml` is a fully-commented template for exposing the backend
Service externally (nginx-ingress + cert-manager shown as an example).
Uncomment and adapt to your ingress controller and domain before applying.

## 4. Schema: how tables get created

There is no separate "run migrations" step required to get a fresh Postgres
usable — `initSchema()` (see `backend/src/db/client.ts` /
`backend/src/db/ddl.ts`) runs a set of `CREATE TABLE IF NOT EXISTS`
statements **on every backend boot**, for both PGlite (local/test) and real
Postgres. That's why the Deployment above works against a brand-new database
with zero extra steps: the first pod to start creates the schema, and every
subsequent boot is a no-op against the existing tables.

This is intentionally simple and safe (idempotent, no destructive
statements), but it does not model column/type *changes* to existing tables
— only initial creation. For a production-grade migration story as the
schema evolves, switch to **drizzle-kit migrations**
(`npm run db:generate -w @bosanski/backend` generates SQL migration files
from `backend/src/db/schema.ts`; `npm run db:migrate -w @bosanski/backend`
applies them) run as their own step (e.g. an init container or a pre-deploy
Job) ahead of rolling out a new backend image, instead of relying on
`initSchema()`. `drizzle-kit` is already a dependency; the plumbing to wire
this up (a migrations directory + a `drizzle.config.ts`) is the main gap.

## 5. The JWT-secret boot guard

`backend/src/env.ts`'s `assertProductionSecretsAreSafe()` runs first thing in
`main()` (`backend/src/index.ts`) and **refuses to start** if `DATABASE_URL`
is set (i.e. you're not in local/PGlite mode) and either `JWT_ACCESS_SECRET`
or `JWT_REFRESH_SECRET` is missing or still carries its `dev-`-prefixed
placeholder value. This is deliberate: it's the one thing standing between
"forgot to fill in the Secret" and shipping a production deployment with a
world-known JWT signing key. If a pod is crash-looping right after seeing a
real `DATABASE_URL`, check `kubectl logs` for this error first — it means
`deploy/backend-secret.yaml` still has placeholder JWT secrets (or wasn't
applied at all).

## 6. Updating a running deployment

Since `backend-deployment.yaml` and `voice-agent-deployment.yaml` pin
`:latest`, a rollout doesn't happen automatically when a new image is
pushed — trigger it explicitly:

```bash
kubectl rollout restart -n ljiljan deployment/backend
kubectl rollout restart -n ljiljan deployment/voice-agent
```

For a more controlled/reproducible rollout, use a `sha-<commit>` or semver
tag instead of `latest` in the manifests and bump it explicitly
(`kubectl set image -n ljiljan deployment/backend backend=ghcr.io/OWNER/ljiljan-backend:sha-abc1234`).
