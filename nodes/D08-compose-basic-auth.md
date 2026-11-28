# D08 — compose-basic-auth

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | D07, D06, R02 | none | S |

**Owns:** `backend/test/compose-basic-auth.test.ts`
**Resolves:** #61

## Purpose

With `BASIC_AUTH=on`, the compose stack's Caddy (D07) asks for the basic credentials on every path except
`/health` (`compose/Caddyfile`, the `basic_auth_on` snippet). After sign-in the app sends
`Authorization: Bearer <token>` on every API call (`app/src/api/client.ts`, A03). A request carries one
`Authorization` header, so the browser's cached basic credentials are not sent with those calls, and Caddy
answers each of them with its own 401 without forwarding it (issue #61). With basic auth on, the app cannot load
a course, grade a recording or start a tutor session after sign-in. The `Images` workflow's `compose-stack`
job (D07) checks only `/` and `/health` with basic auth on, so it passes.

This node changes the rule. With `BASIC_AUTH=on`, Caddy asks for the basic credentials on every path except:

- `/health`, as before;
- a request to a path under `/api/` that carries `Authorization: Bearer …`, unless the path is one of the
  routes that answer without a token: today `/api/auth/register`, `/api/auth/login` and `/api/auth/refresh`.

Such a request goes to the backend, which checks the token itself (`requireAuth`, B05) and answers 401 for a
bad one. A token comes only from register, login or refresh, and those three always need the basic credentials,
whatever else the request carries. So only someone who has the basic credentials can get a token, and the site
stays private. The app's calls to those three routes carry no `Authorization` header (they are its public
paths), so the browser sends the basic credentials it cached when it loaded the page. Every other call carries
the token and passes. `/api/auth/me` needs a token, so it is not one of the three, and a Bearer call to it
passes like any other.

The issue proposed a rule that puts every `/api/auth/*` path behind basic auth. That would block
`/api/auth/me` with a Bearer token, which the issue's own check expects to answer 200. A rule keyed only on the
header would open registration to anyone who sends `Authorization: Bearer x` to `/api/auth/register`. The rule
above avoids both. A backend test checks that every backend route that answers without a token is one of the
routes the Caddyfile protects. A route added later without `requireAuth` therefore fails the test until the
Caddyfile names it.

`compose.yaml` passes `DOMAIN` to `web` unchecked, so an empty `DOMAIN` gives Caddy an empty site address and
the export an `https://` origin. With this node, Compose refuses to start when `DOMAIN` is unset or empty.

The README and `compose/.env.example` describe the new rule. On a public address they recommend basic auth.
They also say what happens without it: anyone can register (OD3), and the ports Docker or Podman publishes
are not closed by the host firewall's INPUT rules.

## Tests

`backend/test/compose-basic-auth.test.ts` (vitest; no Docker, no key, no network). It reads `compose/` and
`backend/src/` relative to the test file. It reads `compose/Caddyfile` and every other file under `compose/`
that the Caddyfile could import as text, as D07's test does, skipping `compose.yaml`, the `web.Dockerfile`
files and env files. It parses `compose/compose.yaml` with the `yaml` package.

- **Bearer pass.** The request matcher that the `basic_auth` directive uses names `/health`, an `Authorization`
  header matcher on `Bearer`, and the `/api/*` path. The test checks this in the text of the matcher, a named
  matcher block or an inline one.
- **Token routes.** The test collects every route that `backend/src/routes/*.ts` and `backend/src/app.ts`
  register under `/api/` (`app.get|post|put|patch|delete("/api/…", …)`) without `requireAuth` in that call's
  options. The set is not empty, and today it is `/api/auth/register`, `/api/auth/login` and
  `/api/auth/refresh`. Each of these paths is named in the matcher that the `basic_auth` directive uses.
- **Domain guard.** The `web` service's `DOMAIN` environment value is `${DOMAIN:?<message>}`, so Compose stops
  when the setting is unset or empty.

The test fails on `main` today: its matcher names no `Authorization` header and no token route, and `DOMAIN`
has no guard. D07's `backend/test/compose-stack.test.ts` keeps passing unchanged.

## Changes

- `compose/Caddyfile`: the `basic_auth_on` snippet's matcher leaves out `/health` as before. It also leaves out
  a request whose path is under `/api/*` and whose `Authorization` header starts with `Bearer `, unless the path
  is `/api/auth/register`, `/api/auth/login` or `/api/auth/refresh`. One way is a named matcher whose block
  lines are ANDed: `not path /health` and a `not { path /api/*; header Authorization "Bearer *"; not path
  <the three> }`. The file's header comment states the rule and why the three routes stay behind basic auth.
  The `basic_auth_off` snippet, the handles and everything else do not change.
- `compose/compose.yaml`: `web`'s environment sets `DOMAIN: ${DOMAIN:?set DOMAIN in compose/.env}`. The build
  argument and everything else do not change.
- `compose/.env.example`: the comment on `BASIC_AUTH` states the rule. Basic auth covers the app and the
  sign-in routes. Calls with the app's token go to the backend, which checks the token. `/health` stays open.
  On a public address, set it to `on`: without it anyone can register. The comment on `DOMAIN` says that it
  must not be empty.
- `README.md`, the single-host stack section:
  - The basic-auth item states the same rule, and that the app works with it on.
  - The known limits say two more things. With basic auth off on a public address, anyone can register. The
    ports Docker or Podman publishes are not closed by the host firewall's INPUT rules, so a firewall does not
    make the stack private.
  - The rest of the README does not change.
- `.github/workflows/images.yml`, the `compose-stack` job's basic-auth step: the existing checks stay, and new
  checks follow them, with no credentials unless stated:
  - `POST /api/auth/register` with the basic credentials, a generated e-mail address and password answers 200
    with an access token and a refresh token. `POST /api/auth/login` with the basic credentials answers 200
    with a token pair.
  - `GET /api/auth/me` and `GET /api/courses` with `Authorization: Bearer <access token>` answer 200.
    `GET /api/courses` with `Authorization: Bearer x` answers 401 without a `WWW-Authenticate: Basic` header,
    which shows that the backend's check answered.
  - `GET /api/courses` with no credentials answers 401 with a `WWW-Authenticate: Basic` header (Caddy's).
  - `POST /api/auth/register`, `/api/auth/login` and `/api/auth/refresh` with
    `Authorization: Bearer <access token>` answer 401 with a `WWW-Authenticate: Basic` header.
  - `POST /api/auth/refresh` with the basic credentials and the refresh token answers 200 with a new pair.

  A failing check names the path, the status and the header it got. Logs, teardown, the job's other steps and
  the workflow's other two jobs do not change.
- `backend/test/compose-basic-auth.test.ts`: new, the cases above.
- `backend/src/`, `app/`, `backend/test/compose-stack.test.ts`, `deploy/`, `DEPLOY.md`, `ci.yml` and
  `release.yml` do not change.

## Gate

- **D08-AC-1** — With `BASIC_AUTH=on`, the Caddyfile's basic auth leaves out `/health`, and any `/api/*` request that carries `Authorization: Bearer …`, except `/api/auth/register`, `/api/auth/login` and `/api/auth/refresh`. Every `/api/` route that the backend registers without `requireAuth` is named among those protected paths. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-basic-auth.test.ts` (the Bearer pass and token routes cases).
- **D08-AC-2** — `compose.yaml` passes `DOMAIN` to `web` as `${DOMAIN:?…}`, so Compose refuses an unset or empty `DOMAIN`. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-basic-auth.test.ts` (the domain guard case).
- **D08-AC-3** — On the node's pull request, the `Images` workflow's `compose-stack` job runs with basic auth on. Its existing checks still pass: `/` answers 401 without credentials and 200 with them, and `/health` answers 200 without them. Register, then login, with the basic credentials each answer a token pair. `/api/auth/me` and `/api/courses` with only the Bearer token answer 200. `/api/courses` with a bad Bearer token answers the backend's 401. `/api/courses` with no credentials, and register, login and refresh with only a Bearer token, each answer Caddy's 401 (`WWW-Authenticate: Basic`). Refresh with the basic credentials answers a new pair. The PR records the job's outcome, the outcomes of the workflow's other two jobs and the run's URL. *Verify:* the `Images` run on the PR's head commit, recorded in the PR; unpinned (the workflow's own run, not a test).
- **D08-AC-4** — The README's single-host section and `compose/.env.example` state the rule of D08-AC-1, say that the app works with basic auth on, and recommend it on a public address. The README's known limits say that anyone can register with basic auth off on a public address, and that published ports are not closed by the host firewall's INPUT rules. *Verify:* the reviewer reads both against `compose/Caddyfile`.
- **D08-AC-5** — `backend/test/compose-stack.test.ts` passes unchanged. The `compose-stack` job uses no secret, logs in nowhere and pushes nothing. The `Images` workflow's other two jobs, `ci.yml`, `release.yml`, `backend/src/`, `app/`, `deploy/` and `DEPLOY.md` are unchanged. The four `CI` jobs and the backend's typecheck pass. *Verify:* `npm test -w @bosanski/backend -- --maxWorkers=2 test/compose-stack.test.ts`; the reviewer diffs those files with `main` (`grep -n 'secrets\.\|login-action\|push: true' .github/workflows/images.yml` prints nothing); and CI's evidence in the PR.

## Risks

- The browser is not checked in CI. The owner records a post-merge check on a host with a real DNS name and
  basic auth on (OD7): sign up, a reload, a lesson, and a tutor session request. The CI job checks the rule
  with `curl`.
- A route that the backend adds later without `requireAuth` must join the Caddyfile's protected paths. The
  token routes case fails until it does. The case reads route registrations as text, so a route registered
  another way (a plugin prefix, a route table) is not seen.
- Caddy's `path` matcher is case-insensitive and Fastify's routes are case-sensitive. A path that differs from
  a token route only in case still needs the basic credentials at Caddy. If Caddy forwards it, the backend
  answers 404.
- A stranger can send any Bearer value to a token-protected route and reach the backend, which answers 401.
  This reveals only that the backend is up and checks tokens, as `/health` does.
- On a public address with basic auth off, registration is open and has no rate limit (OD3). The README says
  so, but the default stays `off`, so the `localhost` boot needs no credentials.
- The voice-agent service still gets every setting in `compose/.env` through `env_file`, the JWT secrets and
  the Postgres password included. The `web.Dockerfile.dockerignore` file is still not checked by CI. Neither
  is part of this node.
