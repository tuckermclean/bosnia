# A02 — design-system

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | A01 | A04, A05, A06, A07, A08 | S |

**Owns:** `app/src/theme/`, `app/src/components/`

## Purpose

Imported from the code. The app's look: the design tokens and the shared presentational components every
screen uses.

- `app/src/theme/tokens.ts` exports `color` (the golden-lily golds `gold50`…`gold700` with `gold500`
  `#DE9F1F` as the brand colour, the flag blues `blue50`…`blue900`, white, black, grays `gray50`…`gray800`,
  success and error with their backgrounds, warning, and `heart`), `spacing` (4 to 48), `radius` (8, 14, 20,
  pill 999), `fontSize` (12 to 34), `fontWeight` (400, 600, 800), `shadow` (`card`, `raised`), and `theme`
  bundling them with its `Theme` type.
- `app/src/components/` (re-exported by `index.ts`):
  - `Button`: a full-width pressable with a label, variants `primary` (gold), `secondary` (blue), `ghost`
    (outlined) and `danger` (red); `loading` shows a spinner instead of the label; `disabled` or `loading`
    disables it and dims it; it reports `accessibilityRole="button"` and its disabled state.
  - `Card`: a white rounded view, padded and with the card shadow by default.
  - `HeartsBar`: `maxHearts` (default 5) hearts, the first `hearts` of them filled, labelled "`<n>` of `<max>`
    hearts remaining".
  - `ProgressBar`: a track with a fill whose width animates (Reanimated, 350 ms) to `progress` clamped to
    0–1, with the progressbar role and a 0–100 value.
  - `ScreenContainer`: a safe-area view (all edges by default) with a background colour and optional
    horizontal padding.
  - `TextField`: a labelled `TextInput` that shows a red border and an error text when `error` is set.
  - `XpBadge` (⚡ and the xp) and `StreakBadge` (🔥 and the streak): pill badges with an accessibility label.

## Tests

No test of its own. The exercise tests (A06) render `Button` and `Card`, and the home test (A07) renders
`ScreenContainer`, while testing their screens.

## Changes

none: imported

## Gate

- **A02-AC-1** — A `Button` that is disabled or loading does not call `onPress`. *Verify:* unpinned.
- **A02-AC-2** — A `Button` shows its label as text, by which a screen's test finds and presses it. *Verify:* `app/src/features/lesson/exercises/__tests__/WordBank.test.tsx` ("lets the learner assemble tiles in order and reports a correct answer").
- **A02-AC-3** — `HeartsBar` fills the first `hearts` of `maxHearts` hearts and labels the count. *Verify:* unpinned.
- **A02-AC-4** — `ProgressBar` clamps its progress to 0–1. *Verify:* unpinned.
- **A02-AC-5** — `TextField` shows its `error` text under the input when one is given. *Verify:* unpinned.

## Risks

- `TextField`'s label is `gray200`, readable only on the dark auth screens it is used on today.
- `HeartsBar` takes `hearts` above `maxHearts` silently (it fills all of them) and builds no hearts for a
  negative `maxHearts`.
- `danger`'s border colour `#8F332A` is the one colour in these components not taken from the tokens.
- The exercise tests press a disabled Check button, but each exercise's handler also returns early without a
  selection, so no test shows that a disabled `Button` ignores a press.
- `fontWeight.medium` is `'600'`, not the conventional 500.
