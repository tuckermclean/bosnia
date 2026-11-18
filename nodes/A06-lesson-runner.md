# A06 — lesson-runner

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | A02, A03, A05 | A07 | M |

**Owns:** `app/src/features/lesson/`, `app/app/lesson/`

## Purpose

Imported from the code. Playing one lesson: its exercises in order, hearts lost on mistakes, and the
result reported to the backend (B07's lesson-complete).

- `app/app/lesson/[id].tsx` reads the `id` route parameter and renders `LessonRunnerScreen` for it.
- `app/src/features/lesson/LessonRunnerScreen.tsx` loads the lesson and the progress (A03's hooks), with a
  spinner meanwhile and "Couldn't load this lesson." with "Go back" when the lesson fails. The run starts
  with the server's hearts (5 when unknown). Its header has an exit (✕, back), the progress bar and the
  hearts. When the run ends, finished or out of hearts, it reports `{lessonId, correctCount, total}` once,
  the real tally even for a failed run. "Try Again" replaces the route with the same lesson. A lesson
  without exercises shows "No exercises in this lesson yet." and never ends: nothing is reported, and only
  the exit leaves it. The end screens:
  - out of hearts: "Out of hearts" with the tally, "Try Again" and "Back to Home";
  - finished below `PASS_RATIO` (60%): "Not quite there" with the number needed to pass, "Try Again" and
    "Back to Home";
  - finished at or above it: "Lesson complete!" with the tally and "Back to Home".
- `app/src/features/lesson/useLessonRunner.ts` holds a run's local state: the current exercise and index,
  `total` (the exercise count), progress (`index / total`), correct and wrong counts, and hearts. A wrong
  answer takes one heart (not below 0); the run is finished after the last exercise, and out of hearts
  when hearts reach 0 before that.
- `app/src/features/lesson/exercises/`: `ExerciseRenderer` picks the component by `exercise.type` and shows
  "Unsupported exercise type" for another. Each component calls `onComplete({correct})` from its "Continue"
  button:
  - `MultipleChoice`: pick one of `choices` (the English `promptEn` shown as a hint), "Check" (disabled
    until a choice), then "Tačno! Correct." or "Not quite. Correct answer: <answer>"; correct when the
    pick equals `answer`.
  - `WordBank`: tap tiles from `choices` into a sentence, tap a built tile to send it back, "Check" (disabled
    while the sentence is empty); correct when the words joined by spaces equal the trimmed `answer`.
  - `MatchPairs`: both columns of `pairs` shuffled; tap a Bosnian and an English item (either order); a
    match locks, a mismatch flashes red for 450 ms and clears. When all are matched it shows "Sve tačno!
    All matched."; correct only when there was no mismatch.
  - `ListenChoose`: a play button for `audioUrl` (disabled, "Audio not available yet", when not playable),
    then choices and Check as in MultipleChoice, with "Correct answer: <answer>" on a miss.
  - `Speak`: A05's `RecordExercise` for `targetPhrase`; after a result, "Continue" reports correct when the
    score is at least 60. It renders nothing when the exercise has no `targetPhrase`.
  - `types.ts`: `ExerciseResult` and the components' props.

## Tests

`app/src/features/lesson/exercises/__tests__/`: `MultipleChoice.test.tsx`, `WordBank.test.tsx`,
`MatchPairs.test.tsx` and `ListenChoose.test.tsx` render each component with a fixture exercise (expo-audio
mocked for ListenChoose) and check the correct and the wrong path. The runner, the screen and `Speak` have
no test.

## Changes

none: imported

## Gate

- **A06-AC-1** — MultipleChoice's Check does nothing without a choice; a correct pick shows "Tačno! Correct." and reports `{correct: true}`. *Verify:* `app/src/features/lesson/exercises/__tests__/MultipleChoice.test.tsx` ("disables Check until a choice is selected, then reports a correct answer").
- **A06-AC-2** — A wrong MultipleChoice pick shows the correct answer and reports `{correct: false}`. *Verify:* `app/src/features/lesson/exercises/__tests__/MultipleChoice.test.tsx` ("reports an incorrect answer when the wrong choice is checked").
- **A06-AC-3** — WordBank tiles tapped in the answer's order report `{correct: true}`. *Verify:* `app/src/features/lesson/exercises/__tests__/WordBank.test.tsx` ("lets the learner assemble tiles in order and reports a correct answer").
- **A06-AC-4** — A built WordBank tile tapped again returns to the bank; a sentence in the wrong order shows the answer and reports `{correct: false}`. *Verify:* `app/src/features/lesson/exercises/__tests__/WordBank.test.tsx` ("lets the learner remove a tile before checking, and reports a wrong answer for the wrong order").
- **A06-AC-5** — MatchPairs matched without a mismatch shows "Sve tačno! All matched." and reports `{correct: true}`. *Verify:* `app/src/features/lesson/exercises/__tests__/MatchPairs.test.tsx` ("matches every pair in a clean run and reports no misses").
- **A06-AC-6** — After a mismatch, MatchPairs still completes once every pair is matched, and reports `{correct: false}`. *Verify:* `app/src/features/lesson/exercises/__tests__/MatchPairs.test.tsx` ("still finishes after a wrong attempt, but reports the run as not clean").
- **A06-AC-7** — ListenChoose with a placeholder URL shows "Audio not available yet", ignores Check without a choice, and reports `{correct: true}` for the right choice. *Verify:* `app/src/features/lesson/exercises/__tests__/ListenChoose.test.tsx` ("disables Check until a choice is selected, then reports a correct answer").
- **A06-AC-8** — A wrong ListenChoose choice shows "Correct answer: <answer>" and reports `{correct: false}`. *Verify:* `app/src/features/lesson/exercises/__tests__/ListenChoose.test.tsx` ("reports an incorrect answer when the wrong choice is checked").
- **A06-AC-9** — A wrong answer takes one heart; reaching 0 hearts before the last exercise ends the run as out of hearts. *Verify:* unpinned.
- **A06-AC-10** — The end of a run reports `{lessonId, correctCount, total}` once, with the real tally, and the end screen shows a pass only at 60% or more. *Verify:* unpinned.
- **A06-AC-11** — Speak reports correct when the pronunciation score is at least 60. *Verify:* unpinned.

## Risks

- An out-of-hearts run reports `total` as the lesson's exercise count, so the backend takes a heart for
  every exercise not reached, as well as for each wrong one.
- Hearts are counted locally from the progress the screen loaded; the backend recomputes them (B07).
- A failed lesson-complete is not shown: the end screens appear whatever the server answered.
- "Try Again" replaces the route with the same lesson; whether expo-router remounts the screen, and so
  resets the run's state, is untested.
- `Speak` renders nothing without a `targetPhrase`, and `MatchPairs` never completes with no `pairs`: either
  leaves the run with no way forward but the exit.
- `WordBank`'s comment says the tiles are shuffled again; the code keeps the content's order.
- Choices are keyed by their text, so a duplicate choice collides; WordBank compares strings exactly, case
  and punctuation included.
- The exercise payloads carry the answers (B07's risk): the client grades and the server only clamps (OD8).
- A lesson with no exercises never finishes on the client, so it is never reported (the backend would not
  pass it either, B07).
- A run that starts at 0 hearts is out of hearts at once: it shows "Out of hearts" before any exercise and
  reports 0 of `total`, which the backend records as an attempt and counts toward the streak (B07).
