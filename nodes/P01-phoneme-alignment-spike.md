# P01 — phoneme-alignment-spike

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| later | none | none | S |

**Owns:** `docs/research/phoneme-alignment.md` (new), `docs/research/tests/check_phoneme_doc.sh` (new)

## Purpose

Pronunciation scoring is a word-level diff of a Whisper transcript against the target phrase
(`backend/src/services/scoring.ts`); it cannot say which sound was wrong (e.g. č vs c). Phoneme-level
forced alignment is wanted later (owner's answer to Q12). Before choosing an aligner, this spike
compares the options for Bosnian. It produces a document, not code; a build node follows only if the
owner accepts the recommendation.

## Tests

A shell check that the document exists and has the required sections. Red target:
`sh docs/research/tests/check_phoneme_doc.sh`.

## Changes

1. Write `docs/research/phoneme-alignment.md` with the sections the Gate lists. *P01-AC-1,
   P01-AC-2, P01-AC-3.*

## Gate

- **P01-AC-1** — The document compares at least two aligners (or approaches), each with Bosnian/Serbo-Croatian language support, licence, runtime (CPU/GPU, latency per utterance) and how it would run next to the backend. *Verify:* `sh docs/research/tests/check_phoneme_doc.sh` checks the `## Candidates` section has at least two `### ` entries, each with the words `Licence`, `Language` and `Runtime`.
- **P01-AC-2** — The document ends with `## Recommendation` naming one option and the first build node it would need (its summary and size). *Verify:* the same script checks the section exists and is not empty.
- **P01-AC-3** — The document says how scores would reach the learner without breaking the existing `score`/`perWord` response. *Verify:* the same script checks a `## Compatibility` section exists.

## Risks

- A spike can run long; stop at one day and record what is unknown.
- Whatever it recommends must keep keys server-side (principle 1).
