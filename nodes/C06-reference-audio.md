# C06 — reference-audio

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | C02, C04 | none | S |

**Owns:** `content/src/synthesize-audio.ts`, `content/test/synthesize-audio.test.ts`

## Purpose

Imported from the code. `content/src/synthesize-audio.ts` (`npm run audio`) makes the `bs-BA` reference audio.
`synthesizeAudio` reads every skill file in `generated/skills/` and, for each vocab item's `bs` text and each
`listen_choose` and `speak` exercise's `targetPhrase`, computes `contentHash(text, voice)`, the SHA-256 of
`text|voice`, with the voice from `AZURE_TTS_VOICE` (default `bs-BA-VesnaNeural`). A hash already in
`audio-out/manifest.json` counts as cached; a new one is synthesized and added as `{url, text, voice}`. The
hash is stamped as `audioHash` onto the vocab item or exercise, a skill file is rewritten when a hash changed,
the manifest is written, and `assembleCourse` (C04) refreshes `course.json` when a blueprint exists (its
failure is ignored).

With both `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` set, a new text is sent as SSML to Azure's regional TTS
endpoint (24 kHz mono MP3), saved as `audio-out/<hash>.mp3` and recorded with the URL `audio-out/<hash>.mp3`; a
failed request throws with Azure's status and body. With either unset the run is a dry run: no network call,
and the manifest records `PLACEHOLDER://<hash>.mp3`. The result reports the manifest, the counts of
synthesized and cached texts, and whether it was a dry run.

## Tests

`content/test/synthesize-audio.test.ts`: a dry run (no Azure variables) over one skill file under a temporary
`CONTENT_DATA_ROOT`. No test covers the Azure path (its `fetchImpl` override goes unused).

## Changes

none: imported

## Gate

- **C06-AC-1** — Without the Azure key and region, a run makes no network call, reports `dryRun`, and records every new text in the manifest with a `PLACEHOLDER://` URL. *Verify:* `content/test/synthesize-audio.test.ts` ("writes a manifest with placeholder URLs and never touches the network").
- **C06-AC-2** — A text seen earlier in the same run (a `speak` target equal to a vocab word) is synthesized once and counted as cached. *Verify:* `content/test/synthesize-audio.test.ts` ("writes a manifest with placeholder URLs and never touches the network").
- **C06-AC-3** — A vocab item and a `speak` exercise get `audioHash` equal to `contentHash(text, "bs-BA-VesnaNeural")` in their skill file. *Verify:* `content/test/synthesize-audio.test.ts` ("stamps a matching audioHash back onto vocab and target-phrase exercises", which checks the first vocab item and the `speak` exercise).
- **C06-AC-4** — A second run synthesizes nothing and counts every text as cached. *Verify:* `content/test/synthesize-audio.test.ts` ("is idempotent: a second run synthesizes nothing new (fully cached)").
- **C06-AC-5** — With the key and region set, each new text is posted as `bs-BA` SSML to Azure TTS, saved as `audio-out/<hash>.mp3` and recorded with that relative URL; a non-OK reply throws with its status. *Verify:* unpinned.
- **C06-AC-6** — Every vocab item and every `listen_choose` and `speak` exercise gets its `audioHash`, not only the first vocab item and the `speak` exercise the test checks. *Verify:* unpinned.

## Risks

- A dry run's `PLACEHOLDER://` entries count as cached on a later run with Azure keys, so a key run over the
  committed manifest (all placeholders) synthesizes nothing: real audio needs the manifest's placeholder
  entries removed first. Neither URL form plays in the app (`SPEC.md`, OD4).
- The manifest is written only at the end: a run that fails part-way keeps the MP3s and the skill files
  already stamped but loses their manifest entries, so the next run pays for them again.
- An unreadable or invalid manifest is silently treated as empty and then overwritten.
- The voice is read from `AZURE_TTS_VOICE` at import; changing it changes every hash, so every text is
  synthesized again.
- The run rewrites skill files and `course.json` in `content/generated/` and the manifest in `content/audio-out/`, both
  out of scope: a node may change this code but never run it against them.
