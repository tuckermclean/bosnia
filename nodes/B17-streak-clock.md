# B17 — streak-clock

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | B07 | none | S |

**Owns:** `backend/test/streak-utc.test.ts`
**Resolves:** #32

## Purpose

B07's lesson-complete route (`backend/src/routes/progress.ts`) reads the current time with `new Date()` and
updates the streak with `computeStreak(lastActive, now, streak)`, which compares UTC calendar days. B07-AC-2's
test ("bumps the streak by one on a second day and unlocks/crowns the completed skill", in
`backend/test/progress.test.ts`) means "yesterday" by setting `lastActive` to 25 hours before the real clock.
Between 00:00 and 01:00 UTC that instant is two UTC days back, so `computeStreak` returns 1 and the test's
expected streak of 4 fails. CI runs in UTC, so a backend job that runs in that hour fails.

Nor does any test fix the time zone: CI runs in UTC, so the suite would still pass if `isSameCalendarDay` read
local time (`getDate` in place of `getUTCDate`), and nothing pins that streaks count UTC days rather than the
host's.

This node puts the streak tests on a fixed clock and adds the cases that pin UTC days. B07-AC-2's test keeps its
name and its assertions, and runs with the route's clock set by the test to an instant just after a UTC midnight,
with `lastActive` just before it. A new test file checks `computeStreak` on both sides of a UTC midnight, and
under a non-UTC time zone, where local and UTC days differ. `computeStreak`'s behaviour does not change: the node
changes tests, plus a clock seam in the route only if the tests need one.

**Owner's approval.** B07-AC-2's *Verify* names its test, so the test's lines are frozen. On 2026-11-20 the
owner was asked about this change to it: "B07's existing test 'bumps the streak by one on a second day…' in
backend/test/progress.test.ts runs on a fixed clock (2026-01-10T00:30Z, with lastActive 2026-01-09T23:30Z)
instead of `Date.now() - 25h`. Its name and assertions (streak 3→4, unlockedSkillIds ['skill-2']) stay the
same." The owner answered: "Approve #37 (B17)". The approval covers only that test's clock lines: the fixed
instants (the route's clock and `lastActive`), the fake-timer setup and its restore. The test's name and its
assertions stay frozen.

## Tests

- `backend/test/progress.test.ts` (B07): B07-AC-2's test sets the clock that lesson-complete reads to
  `2026-01-10T00:30:00Z` (vitest fake timers, e.g. `vi.useFakeTimers({ toFake: ["Date"] })` with
  `vi.setSystemTime`, or the route's clock seam), before it registers the user, and sets `lastActive` to
  `2026-01-09T23:30:00Z`; it then expects the streak of 3 to become 4 and `unlockedSkillIds` to be
  `["skill-2"]`, as today. It restores the real clock afterwards (an `afterEach` or `finally`), so no other test
  runs on the fixed clock. Its name stays as B07-AC-2's *Verify* names it. The file's other tests keep their names and assertions.
- `backend/test/streak-utc.test.ts` (new; vitest, no database, no network, no key), calling `computeStreak`
  directly with literal instants:
  - **Across a UTC midnight.** `lastActive` `2026-01-09T23:59:59Z` and now `2026-01-10T00:00:00Z` with a streak
    of 3 gives 4; `lastActive` `2026-01-10T00:00:00Z` and now `2026-01-10T23:59:59Z` gives 3; `lastActive`
    `2026-01-08T23:30:00Z` (25 hours earlier) and now `2026-01-10T00:30:00Z` gives 1.
  - **UTC days under a non-UTC zone.** With the process's time zone set to `America/Los_Angeles` (UTC−8 in
    January; e.g. `process.env.TZ`, set for these cases only and restored afterwards), the case first checks that
    the zone took effect (`new Date("2026-01-10T02:00:00Z").getDate()` is 9), and fails saying so if it did not.
    Then, with a streak of 3: `lastActive` `2026-01-09T20:00:00Z` and now `2026-01-10T02:00:00Z` (the same
    Los Angeles day, consecutive UTC days) gives 4; `lastActive` `2026-01-10T01:00:00Z` and now
    `2026-01-10T09:00:00Z` (consecutive Los Angeles days, the same UTC day) gives 3. Both would fail if
    `isSameCalendarDay` compared local days.

## Changes

- `backend/test/progress.test.ts`: B07-AC-2's test on the fixed clock, as above.
- `backend/test/streak-utc.test.ts`: new, the cases above.
- `backend/src/routes/progress.ts`: no change, unless fake timers cannot drive the route (they also drive
  PGlite and Fastify's `inject`); then a clock seam only, such as an optional `now: () => Date` that the routes
  take and that defaults to `() => new Date()`, which only the test passes. `computeStreak`,
  `isSameCalendarDay` and `applyHeartRegen` stay as they are.

## Gate

- **B17-AC-1** — B07-AC-2's test runs with lesson-complete's clock fixed by the test at `2026-01-10T00:30:00Z` and `lastActive` at `2026-01-09T23:30:00Z`, expects the streak to go from 3 to 4 and `unlockedSkillIds` to be `["skill-2"]`, keeps its name, and restores the real clock after it runs; no instant in it comes from the real clock. *Verify:* `npm test -w @bosanski/backend -- test/progress.test.ts`, and the reviewer reads the test's diff.
- **B17-AC-2** — `computeStreak` raises the streak by one from `2026-01-09T23:59:59Z` to `2026-01-10T00:00:00Z`, keeps it from `2026-01-10T00:00:00Z` to `2026-01-10T23:59:59Z`, and resets it to 1 from `2026-01-08T23:30:00Z` to `2026-01-10T00:30:00Z`. *Verify:* `npm test -w @bosanski/backend -- test/streak-utc.test.ts`.
- **B17-AC-3** — Under the `America/Los_Angeles` time zone, which the test checks took effect, `computeStreak` gives 4 from a streak of 3 for `2026-01-09T20:00:00Z` → `2026-01-10T02:00:00Z` and 3 for `2026-01-10T01:00:00Z` → `2026-01-10T09:00:00Z`, and the time zone is restored after these cases. *Verify:* `npm test -w @bosanski/backend -- test/streak-utc.test.ts`.
- **B17-AC-4** — B17-AC-3's Los Angeles cases fail when `isSameCalendarDay` compares local days. *Verify:* the node's PR records the output of `npm test -w @bosanski/backend -- test/streak-utc.test.ts` with `isSameCalendarDay` changed, in a scratch copy and not committed, to use `getFullYear`, `getMonth` and `getDate`, showing both cases of B17-AC-3 failing.
- **B17-AC-5** — `computeStreak`, `isSameCalendarDay` and `applyHeartRegen` are unchanged, and `backend/src/routes/progress.ts` changes at most by a clock seam that defaults to the current time. *Verify:* the reviewer diffs `backend/src/routes/progress.ts` with `main`.
- **B17-AC-6** — The backend suite, with every B07 test under its current name, and `npm run typecheck -w @bosanski/backend` pass. *Verify:* `npm test -w @bosanski/backend`, and CI's backend job runs the typecheck.

## Risks

- `vi.useFakeTimers()` with its default `toFake` list also fakes `setTimeout` and `setImmediate`, which PGlite
  and Fastify's `inject` use, and the test would hang; faking only `Date` avoids that. If even that does not
  work, the route needs the clock seam of Changes.
- The fixed clock is in the past of the real one: an access token signed under the real clock and checked under
  the fixed one would look issued in the future. The test sets the clock before it registers the user.
- Setting `process.env.TZ` while the process runs changes the zone in Node only for the process that sets it;
  vitest runs test files in forked processes by default. The check that the zone took effect turns a runtime
  that ignores it into a failure, not a silent pass.
- `America/Los_Angeles` needs the time zone data that Node's full ICU ships with; a Node built with small ICU
  would fail the zone check.
- Streaks still count UTC days, not the learner's (B07, Risks); this node pins that behaviour, it does not
  change it.
