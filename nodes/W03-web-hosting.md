# W03 — web-hosting

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | W01 | none | M |

**Owns:** `app/Dockerfile` (new), `app/nginx.conf` (new), `app/.dockerignore` (new), `app/src/api/config.ts`, `.github/workflows/ci.yml` (web image job), `.github/workflows/release.yml` (web image job), `deploy/web-deployment.yaml` (new), `deploy/web-service.yaml` (new), `deploy/ingress.yaml`, `DEPLOY.md`

## Purpose

The owner wants the web build hosted alongside the backend. Today the release workflow builds only
the backend and voice-agent images, `deploy/ingress.yaml` is a commented-out example for the backend
alone, and the client's API base URL falls back to `http://localhost:3000` (`app.json`
`extra.apiBaseUrl`), which a deployed browser cannot use. OD2 is the default plan: a static web image
behind the same ingress host, `/api` and `/health` to the backend, everything else to the web image,
and the web build calling its own origin.

## Tests

Add jest cases to `app/src/api/__tests__/config.test.ts` for the web origin fallback, a CI job that
builds and smoke-tests the web image, and a YAML check for the manifests. Red target, e.g.
`cd app && npx jest src/api/__tests__/config.test.ts`.

## Changes

1. `config.ts`: on web, with `EXPO_PUBLIC_API_BASE_URL` unset and the page not served from
   `localhost` or `127.0.0.1`, use `window.location.origin`; otherwise keep today's order. *W03-AC-1.*
2. `app/Dockerfile` + `app/nginx.conf`: a node stage runs the web export, an unprivileged nginx stage
   serves `dist/` on port 8080 with a fallback to `index.html` for unknown paths. *W03-AC-2.*
3. CI: a job builds the image and checks it with `curl`. Release: a job builds and pushes
   `ljiljan-web` with the same tags and the same `needs: test` gate as the other images.
   *W03-AC-2, W03-AC-3.*
4. `deploy/web-deployment.yaml` and `deploy/web-service.yaml`; `deploy/ingress.yaml` becomes one host
   with `/api` and `/health` to `backend` and `/` to `web` (still an example to adapt). *W03-AC-4.*
5. `DEPLOY.md`: the web image, the ingress layout, and that same-origin hosting needs no
   `CORS_ORIGINS`. *W03-AC-5.*

## Gate

- **W03-AC-1** — On web with `EXPO_PUBLIC_API_BASE_URL` unset, a page served from `https://ljiljan.example` gets `apiUrl('/x') === 'https://ljiljan.example/api/x'`; a page served from `http://localhost:8081` keeps `http://localhost:3000/api/x`; a set `EXPO_PUBLIC_API_BASE_URL` still wins; native is unchanged. *Verify:* jest cases in `config.test.ts` with `Platform.OS` and `window.location` stubbed.
- **W03-AC-2** — The web image builds from `app/Dockerfile`, runs as a non-root user, and answers `GET /` and `GET /lesson/some-id` with 200 and the exported `index.html`. *Verify:* the new CI job (build, run, `curl`) passes on the node's PR (record the run URL).
- **W03-AC-3** — `release.yml` has a job that builds and pushes `ghcr.io/<owner>/ljiljan-web` with the same tag rules as the backend image and `needs: test`. *Verify:* `python3 -c` loading `release.yml` with PyYAML and asserting a job whose build step names `app/Dockerfile` and whose `needs` includes `test` exits 0; the release run on `main` after merge is recorded in the PR as a follow-up.
- **W03-AC-4** — The `deploy/` manifests parse, define a `web` Deployment and Service on port 8080, and the ingress example routes `/api` and `/health` to `backend` and `/` to `web` on one host. *Verify:* a `python3` check with PyYAML over `deploy/web-*.yaml` and the uncommented example in `deploy/ingress.yaml`, exit 0.
- **W03-AC-5** — `DEPLOY.md` documents the web image, the single-host ingress and that `CORS_ORIGINS` stays empty for same-origin hosting. *Verify:* `grep -q ljiljan-web DEPLOY.md && grep -q CORS_ORIGINS DEPLOY.md` exits 0.

## Risks

- Building the web export inside the image needs `app/`'s lockfile and the content of `app/` only;
  keep the build context small with `app/.dockerignore`.
- A push that changes `.github/workflows/*` needs a credential with workflow permission.
- The microphone (pronunciation, W04) only works on HTTPS or `localhost`; the ingress needs TLS.
- `deploy/ingress.yaml` stays an example: domain, TLS and controller are the operator's.
