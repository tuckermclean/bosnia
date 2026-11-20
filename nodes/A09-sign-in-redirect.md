# A09 — sign-in-redirect

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | A04 | none | S |

**Owns:** `app/__tests__/auth-navigation.test.tsx`
**Resolves:** #31

## Purpose

After a successful sign in or sign up, the app stays on the form. The auth store (A04) becomes `authenticated`,
but the root layout `app/app/_layout.tsx` reacts only to `unauthenticated` (it replaces a screen outside the
`(auth)` group with sign-in), and the only redirect to the tabs is in `app/app/index.tsx`, which the boot
redirect has already replaced (expo-router's `<Redirect>` is a `router.replace`). So nothing navigates to
`/(tabs)/home`; the form stays until the next start, when the saved tokens sign the user in.

This node has the root layout send an authenticated session out of the `(auth)` group to the Learn tab, which
covers sign in and sign up alike. A new app test renders the shell's own routes with expo-router's
`renderRouter` (`expo-router/testing-library`, shipped with expo-router 57) and a mocked API client, and pins
the redirect after sign in and sign up together with the shell's other redirects: the boot landing and the
bounce to sign-in. None of A04's redirects is tested today (A04, Tests).

## Tests

`app/__tests__/auth-navigation.test.tsx` (jest-expo, no key, no network). It sits outside `app/app/`: expo-router's
route context (`expo-router/_ctx-shared.js`) ignores only `+api`, `+html` and `+native-intent` files, so a test
file under `app/app/` would be read as a route.

- **Routes.** `renderRouter` gets a route map with A04's real files: `_layout` (`app/app/_layout.tsx`), `index`,
  `(auth)/_layout`, `(auth)/sign-in`, `(auth)/sign-up` and `(tabs)/_layout`. Every other route the root stack
  and the tab bar declare (`(tabs)/home`, `(tabs)/tutor`, `(tabs)/profile`, `lesson/[id]`, `tutor`) is a stub
  screen that renders its own text, so the test does not load A06's, A07's or A08's screens. The initial URL is
  `/` unless a case says otherwise.
- **Mocks.** `@/api`'s `authApi` (`me`, `login`, `register`) is a set of jest mocks, and `@/api/tokenStorage`'s
  `saveTokens` and `clearTokens` resolve without touching the secure store. `ApiError` is the real class from
  `@/api/client`. Native-only modules that jest-expo does not already mock (the splash screen, the safe-area
  provider, the gesture handler root) are mocked in the test file; `app/package.json`'s jest config (A01) does
  not change. Before each case the store is reset to `idle` with no user, and the mocks are reset.
- **Location.** Each case asserts the route with `renderRouter`'s matchers (`toHavePathname`, or the segments)
  and the screen it shows.

The cases:

- **Boot, signed in.** `me` resolves with a user: the app lands on `/home` (the Learn stub).
- **Boot, signed out.** `me` rejects: the app lands on `/sign-in` and shows the sign-in form.
- **Sign in.** From the signed-out boot, the test fills the email and password fields and presses the sign-in
  button; `login` resolves with a token pair and a user. The app lands on `/home` without a new render of the
  router, and the sign-in form is gone. `login` was called with the email trimmed and lower-cased.
- **Sign up.** From the signed-out boot, the test goes to sign up (the screen's link to it), fills an email and
  an 8-character password and presses the create-account button; `register` resolves. The app lands on `/home`.
- **Failed sign in.** `login` rejects with an `ApiError` whose message is "Invalid email or password": the app
  stays on `/sign-in` and shows that message.
- **Log out.** After a signed-in boot on `/home`, the store's `logout()` (in `act`) brings the app to `/sign-in`.

Today the sign-in and sign-up cases fail: the app stays on `/sign-in` and `/sign-up`. The boot, failed sign-in and
log-out cases pass.

## Changes

- `app/app/_layout.tsx`: the effect that reacts to the auth status also replaces the route with `/(tabs)/home`
  when the status is `authenticated` and the first segment is `(auth)`. Its bounce to sign-in, the hydration on
  boot, the splash handling and the stack stay as they are, and the comments describe both redirects.
- `app/__tests__/auth-navigation.test.tsx`: new, the cases above.

The sign-in and sign-up screens, `app/app/index.tsx` and the auth store do not change.

## Gate

- **A09-AC-1** — From a boot whose `GET /auth/me` fails, a sign in whose login succeeds lands on the Learn tab (`/home`) without a restart, and the sign-in form is no longer shown. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/auth-navigation.test.tsx)` (the sign-in case).
- **A09-AC-2** — From the same boot, a sign up whose register succeeds lands on the Learn tab (`/home`) without a restart. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/auth-navigation.test.tsx)` (the sign-up case).
- **A09-AC-3** — A sign in that fails with an `ApiError` stays on `/sign-in` and shows the error's message. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/auth-navigation.test.tsx)` (the failed sign-in case).
- **A09-AC-4** — On boot the app lands on `/home` when `GET /auth/me` succeeds and on `/sign-in` when it fails. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/auth-navigation.test.tsx)` (the two boot cases).
- **A09-AC-5** — A log out from the Learn tab brings the app to `/sign-in`. *Verify:* `(cd app && npx jest --runTestsByPath __tests__/auth-navigation.test.tsx)` (the log-out case).
- **A09-AC-6** — The test uses no network and no secure store: the API client and token storage are mocked in the test file, and `app/package.json` does not change; the only other file changed is `app/app/_layout.tsx`. *Verify:* the reviewer reads the test's mocks and the PR's diff.
- **A09-AC-7** — The app suite and `npx tsc --noEmit` in `app/` pass. *Verify:* `(cd app && npx jest)` and `(cd app && npx tsc --noEmit)`, and CI's app job.

## Risks

- `renderRouter` runs the real root layout under jest. If its providers (gesture handler root, safe-area
  provider, splash screen) need mocks jest-expo does not give, the test adds them in its own file; a mock that
  hides a provider's behaviour hides it from the test too.
- The route map stubs the tab screens and the lesson and tutor routes; the test proves where the app goes, not
  that A07's or A08's screens render there.
- The redirect lives in the root layout, so it also sends an authenticated session that opens a sign-in or
  sign-up URL directly (a web deep link) to the Learn tab. That is intended.
- The redirect fires when the store becomes `authenticated`, before the screen's own `finally` clears its
  loading state; the screen unmounts with a state update pending. React ignores it, but a warning in the test
  output may come from there.
- The app was never run for this issue: the cause comes from the code and expo-router's source, and the test is
  the first run of the shell's navigation. A web or native run is a post-merge check the owner records.
