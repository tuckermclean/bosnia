# A05 — pronunciation-ui

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | A02, A03 | A06 | S |

**Owns:** `app/src/features/pronunciation/`, `app/src/utils/`

## Purpose

Imported from the code. The client of the pronunciation grader (B08): record a phrase, send it, show the
score.

- `app/src/features/pronunciation/RecordExercise.tsx` shows "Say this phrase out loud:" and the target
  phrase. When an `audioUrl` is given it shows a reference-audio button, "Listen" when the URL is playable
  and disabled with "Audio not available yet" when it is not. "🎙️ Tap to record" asks for the microphone
  (a refusal shows "Microphone permission is required to practice pronunciation."), sets the audio mode to
  allow recording, and records with expo-audio's high-quality preset; the button then shows the seconds
  recorded and stops on tap. Stopping submits the recording at once (A03's `useSubmitPronunciation`, with
  the target phrase and the exercise id) and shows "Grading your pronunciation…". The result shows the
  score rounded out of 100, one chip per target word, green when matched and red when not, and "We heard:"
  with the transcript (or "—"). A failed submission shows "Something went wrong grading your
  pronunciation."; after a result or an error "Try again" returns to the start. Each result is also handed
  to `onComplete`.
- `app/src/utils/audio.ts`: `isPlayableAudioUrl(url)` is true only for an `http://` or `https://` URL, so
  the content pipeline's `PLACEHOLDER://` URLs (OD4) never reach the player.

## Tests

No test of its own. The ListenChoose test (A06) shows the "Audio not available yet" state for a
`PLACEHOLDER://` URL, which goes through `isPlayableAudioUrl`.

## Changes

none: imported

## Gate

- **A05-AC-1** — `isPlayableAudioUrl` rejects a `PLACEHOLDER://` URL, so the exercise's listen control reads "Audio not available yet". *Verify:* `app/src/features/lesson/exercises/__tests__/ListenChoose.test.tsx` ("disables Check until a choice is selected, then reports a correct answer").
- **A05-AC-2** — Stopping a recording submits it with the target phrase and exercise id, without another tap. *Verify:* unpinned.
- **A05-AC-3** — A graded result shows the rounded score, a matched or unmatched chip per target word, and the transcript, and is passed to `onComplete`. *Verify:* unpinned.
- **A05-AC-4** — A refused microphone permission shows the permission message and records nothing. *Verify:* unpinned.
- **A05-AC-5** — A failed submission shows the error message and offers "Try again". *Verify:* unpinned.

## Risks

- A05-AC-1's test goes through `ListenChoose` (A06), not `RecordExercise`; nothing renders `RecordExercise`
  in a test, and expo-audio's recorder is native, so its flow is checked only in a run of the app.
- The backend's answer for a missing Groq key (a 500 today, a 503 by principle 7) shows the same generic error
  as any other failure.
- The submission is native-only as A03 builds it (see A03's risks), so the grader does not work in the web
  build yet (principle 8).
- Recording has no length limit on the client; the backend's multipart limit (B10) is the only bound.
- The auto-submit effect depends on `stage` alone and reads the recorder's `uri` when it fires.
