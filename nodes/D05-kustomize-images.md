# D05 — kustomize-images

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | R01, B01, D03, D04 | none | S |

**Owns:** `backend/test/deploy-kustomization.test.ts`
**Resolves:** #15

## Purpose

The three workloads in `deploy/` (D03) hardcode their images: `backend-deployment.yaml` and `seed-job.yaml` name
`ghcr.io/OWNER/ljiljan-backend:latest`, and `voice-agent-deployment.yaml` names
`ghcr.io/OWNER/ljiljan-voice-agent:latest`. Applying `kubectl apply -f deploy/` as committed pulls images that don't
exist, so `DEPLOY.md` §3 (D04) has the operator edit the three files, with `sed` if they like. And because `:latest`
is pinned, a pod restart can silently pull a newer image.

This node gives the manifests one place for the images: `deploy/kustomization.yaml`. It lists the manifests and
sets each image's registry, owner and tag in its `images:` field. Each workload names its image by a bare name
(`ljiljan-backend`, `ljiljan-voice-agent`) with no registry or tag. The committed kustomization names the images
`.github/workflows/release.yml` (D02) publishes for this repository, `ghcr.io/tuckermclean/ljiljan-backend` and
`ghcr.io/tuckermclean/ljiljan-voice-agent`, with `newTag: latest`, so `kubectl apply -k deploy/` works as committed
and no file in `deploy/` names `OWNER`. A fork sets its own owner, and a rollout its tag, with
`kustomize edit set image` or by editing that one file. `DEPLOY.md` §3 and §6 describe that flow, including a
rollout to a `sha-<short commit>` tag, and the `sed` step goes. A backend test parses the YAML and checks the
kustomization against the files in `deploy/`. It needs no cluster and no kustomize binary.

## Tests

`backend/test/deploy-kustomization.test.ts` (vitest; no cluster, no key, no network). It reads `deploy/` relative
to the test file and parses every `*.yaml` there with the `yaml` package (`parseAllDocuments`). A file's resources
are its non-empty documents, so a file that is only comments (`ingress.yaml`) holds none. A file is a Secret file
when one of its resources has `kind: Secret`. That covers the tracked `backend-secret.example.yaml` and the
operator's gitignored `backend-secret.yaml`, so the test passes whether or not that file is present. Cases:

- the kustomization has `apiVersion: kustomize.config.k8s.io/v1beta1` and `kind: Kustomization`;
- its `resources:` lists exactly the files in `deploy/` that hold at least one resource, apart from the
  kustomization itself and the Secret files, each once, with `namespace.yaml` first;
- it lists no Secret file and has no `secretGenerator`;
- its `images:` has one entry named `ljiljan-backend` and one named `ljiljan-voice-agent`, each with a `newName`
  of the form `ghcr.io/<owner>/<that image's name>` and a non-empty `newTag`. `<owner>` is one path segment of
  lowercase letters, digits and hyphens (GHCR's lowercased GitHub owner), so the literal `OWNER` fails, and both
  entries name the same owner. The test does not name the owner itself, so a fork that sets its own still passes;
- the image of every container and init container in the pod template of each listed resource
  (`Deployment`, `Job`) is a name that some `images:` entry names. No image carries a registry or a tag. The
  test finds three: the backend Deployment, the seed Job and the voice-agent Deployment;
- no file in `deploy/` contains `OWNER`, the kustomization and the Secret files included, and no file other than
  the kustomization and the Secret files contains `ghcr.io/`, comments included.

The test runs against the committed files: it fails on `main` today, where there is no kustomization.

## Changes

- `deploy/kustomization.yaml`: new. It holds `resources:` with `namespace.yaml` first, then
  `backend-deployment.yaml`, `backend-service.yaml`, `seed-job.yaml` and `voice-agent-deployment.yaml`.
  `ingress.yaml` is named in a comment there, since that file is only comments and has no resource. The
  operator uncomments both together. It also holds `images:`, which maps `ljiljan-backend` to
  `newName: ghcr.io/tuckermclean/ljiljan-backend` and `ljiljan-voice-agent` to
  `newName: ghcr.io/tuckermclean/ljiljan-voice-agent`, both with `newTag: latest`: the lowercased owner and the
  rolling tag `release.yml` publishes for this repository. A header comment says that a fork sets its own
  lowercased GitHub owner here and a rollout sets the tag here, and that neither Secret file is listed.
- `deploy/backend-deployment.yaml`, `deploy/seed-job.yaml`, `deploy/voice-agent-deployment.yaml`: `image:`
  becomes the bare `ljiljan-backend` or `ljiljan-voice-agent`, and the header comments that tell the operator to
  replace `OWNER` point to `kustomization.yaml` instead. Nothing else in these files changes.
- `DEPLOY.md` §3: apply the namespace and then the filled-in Secret with `kubectl apply -f`, as today. Then apply
  the rest with `kubectl apply -k deploy/`. The guide says the committed kustomization names this repository's
  images at `latest`, and that a fork first sets its own lowercased owner there, in either of two ways:
  `kustomize edit set image ljiljan-backend=ghcr.io/<owner>/ljiljan-backend:<tag>` (and the same for the voice
  agent), run in `deploy/` with the standalone `kustomize` binary, or an edit of the `images:` entries. It points
  to §6 for pinning a `sha-<short commit>` tag. The subsections for the backend, the seed Job and the voice agent
  say what `apply -k` creates. The voice agent stays optional: the operator drops its line from `resources:` to
  leave it out. The seed Job subsection says that on a fresh database a first seed attempt can fail while the
  backend pods create the schema at the same time, and that the Job retries it (`backoffLimit: 2`). Its re-run
  note says to delete the Job before re-applying. The `OWNER` paragraph and its `sed` command go.
- `DEPLOY.md` §6: a rollout sets both images' tag to `sha-<short commit>`, the seven-character tag the release
  workflow pushes (D02), or to a semver tag. The operator then deletes the completed seed Job (its pod template
  is immutable, so `apply -k` would fail on it) and runs `kubectl apply -k deploy/` and
  `kubectl rollout status`. It says that with a `sha-` or semver tag a pod restart keeps the same image, and that
  only `latest` needs `kubectl rollout restart`. The `kubectl set image` example uses the image name the
  kustomization sets, or goes.
- `backend/package.json`: `yaml` as a devDependency at an exact version (principle 6). `package-lock.json`
  changes with it, through `npm install` at the root.
- `backend/test/deploy-kustomization.test.ts`: new, the cases above.

## Gate

- **D05-AC-1** — `deploy/kustomization.yaml` is a `kustomize.config.k8s.io/v1beta1` `Kustomization`. Its `resources:` lists, each once, every file in `deploy/` that holds at least one resource, apart from itself and the Secret files, with `namespace.yaml` first. It lists no Secret file and has no `secretGenerator`. *Verify:* `npm test -w @bosanski/backend -- test/deploy-kustomization.test.ts`.
- **D05-AC-2** — The kustomization's `images:` names `ljiljan-backend` and `ljiljan-voice-agent`, each with a `newName` of the form `ghcr.io/<owner>/<that name>`, where `<owner>` is one segment of lowercase letters, digits and hyphens and is the same for both, and a non-empty `newTag`; a literal `OWNER` fails. As committed, the owner is `tuckermclean`, the lowercased owner `.github/workflows/release.yml` publishes this repository's images under, and both tags are `latest`. The image of every container and init container in each listed workload (the backend Deployment, the seed Job and the voice-agent Deployment) is a name the `images:` field names, with no registry or tag. *Verify:* `npm test -w @bosanski/backend -- test/deploy-kustomization.test.ts`, and the reviewer reads `deploy/kustomization.yaml` against `release.yml`.
- **D05-AC-3** — No file in `deploy/` contains `OWNER`, the kustomization included, and no file other than the kustomization and the Secret files contains `ghcr.io/`, so the owner and the tag are set in one file. *Verify:* `npm test -w @bosanski/backend -- test/deploy-kustomization.test.ts`.
- **D05-AC-4** — `DEPLOY.md` §3 applies the namespace and the Secret with `kubectl apply -f`, then the rest with `kubectl apply -k deploy/`. It says the committed kustomization names this repository's images at `latest`, that a fork sets its own owner with `kustomize edit set image` or by editing `deploy/kustomization.yaml`, showing both, and that a rollout pins a `sha-<short commit>` tag (§6). It says how to leave the optional voice agent out, and that a failed first seed attempt on a fresh database is expected and retried by the Job. It has no `sed` step and no instruction to edit the image in a workload manifest. *Verify:* `grep -n 'sed -i' DEPLOY.md` prints nothing, and the reviewer reads §3 against `deploy/kustomization.yaml` and `deploy/seed-job.yaml`.
- **D05-AC-5** — `DEPLOY.md` §6 rolls out a new image by setting its tag to `sha-<short commit>` (the release workflow's seven-character `sha-` tag) or a semver tag in the kustomization. It has the operator delete the completed seed Job before `kubectl apply -k deploy/`, then wait with `kubectl rollout status`. It says a pinned tag keeps a restarted pod on the same image, and that `kubectl rollout restart` is needed only with `latest`. *Verify:* the reviewer reads §6 against `.github/workflows/release.yml` and `deploy/kustomization.yaml`.
- **D05-AC-6** — The yaml parser is a backend devDependency at an exact version, and the backend's typecheck and full suite pass. *Verify:* `npm run typecheck -w @bosanski/backend && npm test -w @bosanski/backend`, and the reviewer reads `backend/package.json`.

## Risks

- `kubectl apply -f deploy/` no longer works as a whole-folder apply: it would also send `kustomization.yaml` to
  the API server, which rejects the unknown `Kustomization` kind. `DEPLOY.md` uses `-f` only for the namespace
  and the Secret.
- `apply -k` creates every workload at once. The seed Job can start before the backend's first pod; the seed
  script runs `initSchema()` itself (`backend/scripts/seed-course.ts`). It may also start before the Secret exists
  if the operator skips that step, and then its pod waits on the missing Secret.
- On a fresh database the first apply runs `initSchema()` three ways at once: in the seed Job and in both backend
  replicas. Its statements are `CREATE TABLE IF NOT EXISTS …` (`backend/src/db/ddl.ts`), and concurrent ones in
  Postgres can fail with a duplicate-key error on the catalog. The failure recovers, since the Deployment
  restarts the pod and the Job retries up to twice, but the first seed attempt can show as failed. The guide
  before this node avoided it by seeding only after `kubectl rollout status`.
- A Job's pod template is immutable. A rollout that changes the backend tag fails on the existing seed Job unless
  the operator deletes it first, and `kubectl apply -k` then exits non-zero even though the Deployments updated.
- The committed kustomization names this repository's owner and `latest`. A fork that applies it unchanged pulls
  the upstream images, or fails to pull them if they are private, until it sets its own owner. With `latest`, a
  pod restart can still pull a newer image until a rollout pins a `sha-` tag.
- The test checks the owner's form, not that it is `tuckermclean`, so a fork's own owner passes; the reviewer
  checks the committed value.
- `kustomize edit` needs the standalone `kustomize` binary; `kubectl` has `apply -k` built in but no `edit`.
- The test checks the kustomization's structure, not what `kustomize build` renders. A kustomize version that
  reads the `images:` field differently is not caught.
- `ingress.yaml` stays out of `resources:` while it is only comments. An operator who uncomments it must also
  uncomment its line, or `apply -k` skips it silently.
