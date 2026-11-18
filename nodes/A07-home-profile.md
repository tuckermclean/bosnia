# A07 — home-profile

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | A02, A03, A04, A06 | none | S |

**Owns:** `app/src/features/home/`, `app/app/(tabs)/home.tsx`, `app/app/(tabs)/profile.tsx`, `app/app/(tabs)/__tests__/`

## Purpose

Imported from the code. The Learn and Profile tabs: the skill tree lessons start from, and the user's stats.

- `app/app/(tabs)/home.tsx` loads the courses and the progress (A03's hooks). Its header greets with
  "Dobrodošli 👋" and "Welcome back" and, once the stats are loaded, shows the streak and xp badges and the
  hearts out of `MAX_HEARTS`. It shows a spinner while either query loads; "Couldn't load your course. Pull to
  refresh soon." when one fails; and "No lessons loaded yet" with "Make sure the backend is running and
  seeded." when both load but there is no course or the first course has no units. Whenever the first course
  has units it renders a `SkillPath` per unit, beside the error text if only the progress failed. Tapping an
  unlocked skill opens its first lesson (`/lesson/<id>`, A06); a locked skill does nothing.
- `app/src/features/home/SkillPath.tsx`: a unit header (level, Bosnian and English title, theme) and its
  skills in a zig-zag of lanes (centre, right, centre, left).
- `app/src/features/home/SkillNode.tsx`: a round button with 🌼 when unlocked, 👑 when the crown is at
  `MAX_CROWN_LEVEL`, 🔒 when locked (then disabled and labelled "(locked)"); the English title; "Level `<n>`/5"
  once crowned; and an "unreviewed content" tag for a skill whose content is unreviewed (principle 3).
- `app/app/(tabs)/profile.tsx`: the user's email; a spinner while the progress loads; then the total xp, the
  day streak and the hearts (0, 0 and 5 when the progress failed); and "Log out" (A04's store).

## Tests

`app/app/(tabs)/__tests__/home.test.tsx` renders the home screen with the course and progress hooks and the
router mocked: the empty state for no course and for a course without units, no empty state while loading or
on error (the error text instead), and the unit shown for a course with units.

## Changes

none: imported

## Gate

- **A07-AC-1** — A successful empty courses answer shows "No lessons loaded yet" and the seeding hint. *Verify:* `app/app/(tabs)/__tests__/home.test.tsx` ("shows the empty state when the courses query succeeds with no courses").
- **A07-AC-2** — A course without units shows the empty state. *Verify:* `app/app/(tabs)/__tests__/home.test.tsx` ("shows the empty state when the course has no units").
- **A07-AC-3** — No empty state is shown while the courses load. *Verify:* `app/app/(tabs)/__tests__/home.test.tsx` ("does not show the empty state while loading").
- **A07-AC-4** — A failed courses query shows the error text, not the empty state. *Verify:* `app/app/(tabs)/__tests__/home.test.tsx` ("does not show the empty state on error").
- **A07-AC-5** — A course with a unit shows that unit's header instead of the empty state. *Verify:* `app/app/(tabs)/__tests__/home.test.tsx` ("renders the skill path (not the empty state) when a course with units is returned").
- **A07-AC-6** — A locked skill cannot be opened; an unlocked one opens its first lesson. *Verify:* unpinned.
- **A07-AC-7** — A skill with unreviewed content is tagged "unreviewed content". *Verify:* unpinned.
- **A07-AC-8** — Profile's "Log out" signs the user out. *Verify:* unpinned.

## Risks

- Only the first course is shown (`courses[0]`).
- A skill always opens its first lesson; nothing leads a learner to a skill's later lessons, while B07 crowns
  a skill only when every lesson of it is passed. Each of the 29 skills of the committed curriculum has one
  lesson, so every skill can be completed today; a skill with more lessons could not be from the app.
- The error text promises a pull to refresh that the screen does not have.
- The home test mocks the hooks and the router; no test presses a skill.
- When the progress fails to load, the profile shows 0 xp, a 0-day streak and full hearts, and no error.
