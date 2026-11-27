# A12 — web-pronunciation-upload

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | A03 | none | S |

**Owns:** `app/__tests__/web-pronunciation.test.ts`
**Resolves:** #55

## Purpose

`submitPronunciation` (`app/src/api/pronunciation.ts`, A03) appends the recording to its `FormData` as
`{ uri, name, type }`, a shape only React Native's networking layer understands. A browser's
`FormData.append` turns a value that is not a `Blob` into the string `[object Object]`, so on web the
multipart request has no audio part and the backend (`backend/src/routes/pronunciation.ts`, B08) cannot grade
it. In the browser, `expo-audio`'s recording is a `blob:` URL, normally of type `audio/webm`; the backend
already accepts any `audio/*` type and defaults the file name to `audio.webm`.

This node makes the web upload send the recording itself: on web, `submitPronunciation` reads the `blob:` URL
into a `Blob` and appends it with the recording's own MIME type and a file name that matches it. Native keeps
the `{ uri, name, type }` part. The finding comes from reading the code (issue #55); it was not run.

## Tests

`app/__tests__/web-pronunciation.test.ts` (jest-expo, no key, no network). The preset resolves modules for a
native platform, so the test imports the web variant by its file and the native one by its file. Global
`fetch` is a jest mock: for the recording's `blob:` URL it answers with a response whose `blob()` gives a test
blob of a chosen type; for the API URL it answers 200 with a pronunciation result. The test records what is
appended to the request's `FormData` (a recording stand-in for `FormData`, or a spy on `append`).

- **Web, webm.** A recording `blob:` URL of type `audio/webm`: the `audio` part is the very blob the URL's
  response gave, with type `audio/webm` and a file name ending in `.webm`; `targetPhrase` and `exerciseId` are
  appended as today; the request is a `POST` to the pronunciation route with that form data and no
  `Content-Type` header of its own (the runtime sets the multipart boundary).
- **Web, other types.** A blob of type `audio/mp4` gets a file name with a matching extension; a blob with no
  type gets the `mimeType` the caller passed or, without one, `audio/webm` and a `.webm` name.
- **Web, unreadable recording.** The `blob:` URL's fetch rejects: `submitPronunciation` rejects and no request
  goes to the pronunciation route.
- **Native.** The `audio` part is `{ uri, name, type }` with the file's own name and the default `audio/m4a`,
  as today, and the recording's URI is not fetched.

Today the web cases fail (there is no web variant and the part is the `{ uri, name, type }` object); the native
case passes.

## Changes

- `app/src/api/`: on web, the audio part is built from the recording's `Blob`. The split is by platform file,
  so the native bundle keeps today's code: for example `submitPronunciation` awaits a small helper that
  appends the audio part, with a native file (today's `{ uri, name, type }` object) and a `.web.ts` file
  (`fetch(audioUri)`, `blob()`, `append('audio', blob, name)`). The type is the blob's own, else the caller's
  `mimeType`, else `audio/webm`; the name is `recording.<extension>` for that type. The exported
  `submitPronunciation` signature and its native behaviour do not change.
- `app/__tests__/web-pronunciation.test.ts`: new, the cases above.
- `app/src/features/pronunciation/` (A05) and the backend do not change.

## Gate

- **A12-AC-1** — On web, `submitPronunciation` appends the recording as the `Blob` its `blob:` URL gives, with that blob's MIME type (`audio/webm` in the case tested) and a file name whose extension matches it, together with `targetPhrase` and `exerciseId`, and posts it to the pronunciation route without a `Content-Type` header of its own. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-pronunciation.test.ts)` (the web webm case).
- **A12-AC-2** — On web, a blob of another audio type gets a matching file name, and a blob with no type falls back to the caller's `mimeType`, else `audio/webm`. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-pronunciation.test.ts)` (the other-types cases).
- **A12-AC-3** — On web, a recording that cannot be read rejects the submission and sends no request to the pronunciation route. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-pronunciation.test.ts)` (the unreadable-recording case).
- **A12-AC-4** — On native the audio part is still `{ uri, name, type }` with the default `audio/m4a`, and the recording's URI is not fetched. *Verify:* `(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/web-pronunciation.test.ts)` (the native case).
- **A12-AC-5** — The app suite and `npx tsc --noEmit` in `app/` pass, and no file outside `app/src/api/` and the test changes. *Verify:* `(cd app && npx tsc --noEmit)`, CI's app job, and the reviewer reads the diff.

## Risks

- The tests check what is appended, not the bytes a browser sends; a real recording graded on the deployed
  stack with `GROQ_API_KEY` set is a post-merge check the owner records.
- Browsers differ in what `expo-audio` records (Chrome and Firefox `audio/webm`, Safari `audio/mp4`); Groq's
  Whisper accepts both, and the backend accepts any `audio/*` type.
- Reading a `blob:` URL with `fetch` stays in the browser and sends nothing over the network; the URL is only
  valid while the page that recorded it is open.
