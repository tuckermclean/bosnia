# D03 — k8s-manifests

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | R03, B02, B06, B10, B11, V03, V07, D02 | B12, D04 | M |

**Owns:** `deploy/`

## Purpose

Imported from the code. `deploy/` holds the plain Kubernetes manifests (no Helm, no Kustomize) for the two
services, all in the `ljiljan` namespace. The image references read `ghcr.io/OWNER/...:latest` literally: the
operator replaces `OWNER` by hand before applying.

- `namespace.yaml`: the `ljiljan` Namespace, applied first.
- `backend-secret.example.yaml`: the template of the `backend-secrets` Secret (`stringData`): `DATABASE_URL`
  (non-empty switches the backend from PGlite to Postgres, B02), the two JWT secrets (placeholders the boot guard
  of B02 rejects only when they are empty or start with `dev-`), `GROQ_API_KEY`, the three LiveKit settings and
  the Azure speech key and region. The operator copies it to `deploy/backend-secret.yaml`, which `.gitignore`
  keeps out of git (R03), and applies the copy.
- `backend-deployment.yaml`: the `backend` Deployment, 2 replicas, image `ljiljan-backend` (B11), pull secret
  `ghcr-pull-secret`, container port 3000 named `http` with `PORT=3000`, every other setting from
  `backend-secrets`, readiness and liveness probes on `GET /health` (B10), requests 100m CPU / 128Mi and limits
  500m / 512Mi.
- `backend-service.yaml`: the `backend` ClusterIP Service, port 80 to the `http` port.
- `seed-job.yaml`: the `backend-seed` Job that runs `node backend/dist/scripts/seed-course.js` (B06) in the
  backend image with the same Secret and pull secret, relying on the image's `CONTENT_DIR` (B11). Its pod is
  never restarted in place (`restartPolicy: Never`); after a failure the Job starts a new pod, at most twice
  (`backoffLimit: 2`).
- `voice-agent-deployment.yaml`: the `voice-agent` Deployment, 1 replica, image `ljiljan-voice-agent` (V07),
  pull secret `ghcr-pull-secret`, settings from the same `backend-secrets` (V03 reads them), no port, Service or probe (it connects out to
  LiveKit), requests 250m / 256Mi and limits 1 CPU / 1Gi.
- `ingress.yaml`: an Ingress for the backend Service, entirely commented out (nginx and cert-manager as the
  example, `api.example.com`).

## Tests

None: no test reads the manifests, and tests use no cluster (principle 4).

## Changes

none: imported

## Gate

- **D03-AC-1** — Every manifest puts its resources in the `ljiljan` namespace that `namespace.yaml` creates. *Verify:* unpinned.
- **D03-AC-2** — The tracked Secret is a template with placeholders only, no real key or password (principle 1); the filled-in `deploy/backend-secret.yaml` is gitignored. *Verify:* unpinned.
- **D03-AC-3** — The backend Deployment runs 2 replicas of the backend image on port 3000 with the `ghcr-pull-secret` image pull Secret, takes its settings from the `backend-secrets` Secret, and probes readiness and liveness on `GET /health`. *Verify:* unpinned.
- **D03-AC-4** — The `backend` Service exposes the backend's `http` port as port 80 inside the cluster only (ClusterIP); the Ingress ships commented out. *Verify:* unpinned.
- **D03-AC-5** — The seed Job runs `node backend/dist/scripts/seed-course.js` in the backend image with the same Secret and the `ghcr-pull-secret` image pull Secret, in a pod that is never restarted in place (`restartPolicy: Never`), retried by the Job at most twice (`backoffLimit: 2`). *Verify:* unpinned.
- **D03-AC-6** — The voice-agent Deployment runs 1 replica of the voice-agent image with the same Secret and the `ghcr-pull-secret` image pull Secret, with no port, Service or probe. *Verify:* unpinned.

## Risks

- The `OWNER` placeholder in three image references makes the manifests unusable as committed: `kubectl apply`
  without the hand edit pulls an image that does not exist.
- The images are `:latest`, so a pod restart can silently pick up a newer image, and a rollout needs
  `kubectl rollout restart`.
- Two backend replicas boot together and both run `initSchema()` against the same database (OD5).
- The voice agent has no probe: a worker that is up but disconnected from LiveKit is not restarted.
- The Secret template omits settings the services read: the voice agent's `DEEPGRAM_API_KEY` and
  `OPENAI_API_KEY` (needed when `STT_PROVIDER` or `LLM_PROVIDER` selects them), `BACKEND_TURNS_URL`,
  `BACKEND_TURNS_TOKEN` and `TUTOR_DEFAULT_LEVEL`. Its header says it lists every setting `backend/src/env.ts`
  reads that is not a plain default.
- The JWT placeholders (`REPLACE_WITH_...`) do not start with `dev-`, so the boot guard (B02) lets a backend start
  with them if the operator forgets to replace them.
- One Secret holds both services' keys, so the voice agent also receives `DATABASE_URL` and the JWT secrets.
- All three workloads name the `ghcr-pull-secret` image pull Secret, which no file in `deploy/` creates:
  `DEPLOY.md` §2 has the operator create it with `kubectl create secret docker-registry` when the GHCR packages
  stay private (D04).
- The seed Job has to be deleted before it can run again; the manifest says so in a comment only.
- No manifest sets a `securityContext`; the images' own users (B11's `node`, V07's `worker`) are the only
  non-root guarantee.
