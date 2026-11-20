# B08 — pronunciation

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | B03, B04, B05 | A03, B10, B15, B16 | M |

**Owns:** `backend/src/services/scoring.ts`, `backend/src/routes/pronunciation.ts`, `backend/test/scoring.test.ts`, `backend/test/pronunciation.test.ts`

## Purpose

Imported from the code. The pronunciation grader: transcribe the learner's recording, score the transcript
against the target phrase, keep the attempt.

- `backend/src/services/scoring.ts` is pure and deterministic. `normalizeText` applies NFC, lowercases, turns hyphens
  and dashes into spaces, strips punctuation and collapses whitespace, keeping the Bosnian letters (č, ć, đ, š, ž).
  `levenshtein` is the edit distance and `charSimilarity` is `1 - distance / longer length` (1 for two empty strings).
  `scorePronunciation(target, transcript)` aligns the two word sequences in order (Needleman–Wunsch on character
  similarity, gap penalty -0.1); a target word is matched when its aligned word's similarity is at least 0.8
  (`WORD_MATCH_THRESHOLD`). The score is `round(100 * clamp(0.5 * matched fraction + 0.3 * mean similarity + 0.2 *
  whole-text similarity - insertion penalty))`, the penalty being `min(0.3, 0.15 * extra words / target words)`. It
  returns the score, the per-word results (target, matched, similarity, what was heard) and the normalized transcript
  and target. An empty target scores 100 against an empty transcript and 0 otherwise.
- `backend/src/routes/pronunciation.ts`: `processPronunciation(deps, input)` transcribes the audio with the
  injected transcriber (B04), scores it, saves a `pronunciation_attempts` row (the exercise id or null) and
  returns `{score, perWord, transcript}`. `POST /api/pronunciation` (logged in, multipart) reads the `audio` file
  and the `targetPhrase` and `exerciseId` fields; it answers 415 for a file whose type is not `audio/*`, 413 for
  one over the upload limit (`MAX_UPLOAD_BYTES`, 10 MiB, registered by the app, B10), 400 without audio or
  target phrase, and otherwise the result of `processPronunciation`.

## Tests

`backend/test/scoring.test.ts`: the normalization, the edit distance and similarity, and `scorePronunciation`
golden cases. `backend/test/pronunciation.test.ts`: `processPronunciation` with a fake transcriber, and the
multipart route (a scored upload, a non-audio file, an oversize file). The server's integration test (B10) scores
a real `speak` exercise's target phrase.

## Changes

none: imported

## Gate

- **B08-AC-1** — `normalizeText` lowercases, strips punctuation, collapses whitespace, keeps the Bosnian diacritics and splits on hyphens. *Verify:* `backend/test/scoring.test.ts` ("lowercases, strips punctuation, collapses whitespace"), `backend/test/scoring.test.ts` ("preserves Bosnian diacritics"), `backend/test/scoring.test.ts` ("treats hyphens as word separators").
- **B08-AC-2** — `levenshtein` is 0 for equal strings and counts single edits; `charSimilarity` is 1 for equal strings, two empties included, and 0 for two different single characters. *Verify:* `backend/test/scoring.test.ts` ("is zero for identical strings"), `backend/test/scoring.test.ts` ("counts single edits"), `backend/test/scoring.test.ts` ("is 1 for identical, 0 for fully different length-1"), `backend/test/scoring.test.ts` ("treats two empties as identical").
- **B08-AC-3** — An exact match scores 100 with every word matched, whatever the case and punctuation. *Verify:* `backend/test/scoring.test.ts` ("gives a perfect score for an exact match"), `backend/test/scoring.test.ts` ("is invariant to case and punctuation").
- **B08-AC-4** — An empty transcript scores 0 with every target word unmatched. *Verify:* `backend/test/scoring.test.ts` ("scores an empty transcript as zero with all words unmatched").
- **B08-AC-5** — One wrong word of three is unmatched and the score stays between 40 and 90; a five-letter word one letter off still matches and scores above 70. *Verify:* `backend/test/scoring.test.ts` ("marks one wrong word out of three as unmatched and keeps the score partial"), `backend/test/scoring.test.ts` ("accepts a minor mispronunciation within the tolerance threshold").
- **B08-AC-6** — Extra words lower the score but keep it above 0, and the target words still match. *Verify:* `backend/test/scoring.test.ts` ("penalizes extra inserted words but stays above zero").
- **B08-AC-7** — Scoring is deterministic, and each target word reports what was heard. *Verify:* `backend/test/scoring.test.ts` ("is deterministic"), `backend/test/scoring.test.ts` ("reports what was heard for each target word").
- **B08-AC-8** — `processPronunciation` returns what `scorePronunciation` gives for the transcript and saves the attempt, with a null exercise id when none is given and the id when one is. *Verify:* `backend/test/pronunciation.test.ts` ("scores against the fake transcript exactly like scorePronunciation and persists the attempt"), `backend/test/pronunciation.test.ts` ("records the exerciseId when provided").
- **B08-AC-9** — `POST /api/pronunciation` scores a multipart audio upload and saves the attempt with its exercise id. *Verify:* `backend/test/pronunciation.test.ts` ("scores a real multipart audio upload end-to-end").
- **B08-AC-10** — An upload whose type is not `audio/*` is answered 415, and one over the upload limit 413. *Verify:* `backend/test/pronunciation.test.ts` ("rejects a non-audio content type with 415"), `backend/test/pronunciation.test.ts` ("rejects an oversize upload with 413").
- **B08-AC-11** — A request without an audio file or without a target phrase is answered 400. *Verify:* unpinned.

## Risks

- The score compares text, not sounds: Whisper may write the right word for a wrong pronunciation. Phoneme-level
  scoring is priority 7 (`FOLLOWUPS.md`).
- Without `GROQ_API_KEY` the route answers 500, not principle 7's 503 (`SPEC.md`, known gaps).
- The target phrase and exercise id come from the client and are not checked against an exercise or its lock.
  Each request is a paid Groq call, with no rate limit.
- A request that is not multipart is answered 500, not a 4xx: the multipart plugin's error carries its own status, but
  the app's error handler (B10) answers every error that is neither an `HttpError` nor a zod error with 500.
- The audio type is the one the client declares; the whole file (up to 10 MiB) is buffered in memory.
- The punctuation class repeats the ASCII `"` and `'` where typographic quotes (U+201C, U+201D, U+2018, U+2019)
  may have been meant, so those quotes are not stripped and lower a word's similarity.
