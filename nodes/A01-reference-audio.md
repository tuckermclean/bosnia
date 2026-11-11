# A01 — reference-audio

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | none | none | M |

**Owns:** `content/src/synthesize-audio.ts`, `content/README.md` (audio section), `.env.example` (`AUDIO_BASE_URL`), `backend/scripts/seed-course.ts` (only if a test exposes a defect), `DEPLOY.md` (audio section), `FOLLOWUPS.md` (audio entry), `app/README.md` (audio line)

## Purpose

The docs say real audio appears once `AZURE_SPEECH_KEY` is set and `npm run audio` runs. The audit
(`docs/AUDIT.md`, A17) found it does not:

- every hash already in `content/audio-out/manifest.json` counts as cached, and all 386 committed
  entries are `PLACEHOLDER://` sentinels, so a run with a key synthesizes nothing;
- real files get the relative URL `audio-out/<hash>.mp3`, which seeding copies as is and the app
  refuses (it plays only `http(s)://`);
- nothing hosts the files: the backend image ships only the manifest and serves no static files.

The owner chose object storage or a CDN, an `AUDIO_BASE_URL` setting and absolute URLs (Q3, OD7).
Running the synthesis with a real key and uploading the files stay the owner's tasks.

## Tests

Extend `content/test/synthesize-audio.test.ts` (keep its cases) with a stubbed Azure `fetch`, and a
backend seed test for absolute URLs. Red target:
`npm run test -w @bosanski/content -- test/synthesize-audio.test.ts`.

## Changes

1. With a key, a manifest entry whose URL starts with `PLACEHOLDER://` is synthesized again; real
   entries stay cached. *A01-AC-1.*
2. With a key, the manifest URL is `<AUDIO_BASE_URL>/<hash>.mp3` (one slash); `AUDIO_BASE_URL` must
   be `http(s)://`. Missing or invalid, the run stops before any synthesis with an error naming
   `AUDIO_BASE_URL` (principle 7). *A01-AC-2, A01-AC-3.*
3. The dry run (no key) is unchanged. *A01-AC-4.*
4. Docs: synthesize with key and `AUDIO_BASE_URL`, upload `content/audio-out/*.mp3` to that
   location, commit the manifest, re-seed; FOLLOWUPS updated. *A01-AC-6.*

## Gate

- **A01-AC-1** — With a key and region set and Azure stubbed, a manifest holding one `PLACEHOLDER://` entry and one `https://` entry re-synthesizes only the placeholder and reports it as synthesized, not cached. *Verify:* a vitest test with a stubbed `fetch` and a temporary audio directory.
- **A01-AC-2** — With `AUDIO_BASE_URL=https://cdn.example/audio/` (trailing slash or not), a synthesized entry's URL is `https://cdn.example/audio/<hash>.mp3`. *Verify:* vitest cases for both forms.
- **A01-AC-3** — With a key but `AUDIO_BASE_URL` unset or not `http(s)://`, `synthesizeAudio` rejects before any request to Azure with an error naming `AUDIO_BASE_URL`, and `npm run audio` exits non-zero. *Verify:* a vitest test asserting the stubbed `fetch` was never called.
- **A01-AC-4** — With no key, the run still writes placeholders and leaves the committed manifest unchanged. *Verify:* the existing dry-run test, plus `npm run audio -w @bosanski/content && git diff --exit-code content/audio-out/manifest.json`.
- **A01-AC-5** — Seeding with a manifest entry `https://cdn.example/audio/x.mp3` gives the matching exercise that `audioUrl`. *Verify:* a vitest test of `seedCourse` in `backend/test/`.
- **A01-AC-6** — `content/README.md` and `DEPLOY.md` describe the steps (key, `AUDIO_BASE_URL`, upload, commit, re-seed) and `.env.example` lists `AUDIO_BASE_URL`. *Verify:* `grep -q AUDIO_BASE_URL content/README.md && grep -q AUDIO_BASE_URL DEPLOY.md && grep -q AUDIO_BASE_URL .env.example` exits 0.

## Risks

- A01-AC-5 likely passes at RED (seeding already copies URLs); record it as `already_satisfied` and
  keep the test as the contract.
- Changing the CDN later means re-writing the manifest's URLs; a one-off rewrite is the owner's.
- Synthesis tests must never write into the repository's `content/audio-out/`.
