# A04 — app-shell

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | A02, A03 | A07, A08, A09 | M |

**Owns:** `app/src/state/`, `app/app/_layout.tsx`, `app/app/index.tsx`, `app/app/(auth)/`, `app/app/(tabs)/_layout.tsx`

## Purpose

Imported from the code. The session and the navigation frame: who is signed in, where the app lands, and
the screens around the features (expo-router's file routes under `app/app/`).

- `app/src/state/authStore.ts` (Zustand): `status` is `idle`, `hydrating`, `authenticated` or
  `unauthenticated`, with `user`. `hydrate()` calls `GET /auth/me` and is `authenticated` with the user,
  or `unauthenticated` on any error. `login` and `register` call the API, save the token pair and become
  `authenticated`; `logout` clears the tokens and becomes `unauthenticated`. The module registers A03's
  auth-expired handler, which sets `unauthenticated`.
- `app/app/_layout.tsx`: the root wraps the app in the gesture handler root, the safe-area provider and the
  TanStack Query provider (A03's client), with a light status bar. It keeps the splash screen up until the
  hydration it starts on boot ends; afterwards, whenever the status is `unauthenticated` outside the
  `(auth)` group, it replaces the route with `/(auth)/sign-in`. Its stack declares `index`, `(auth)`,
  `(tabs)`, `lesson/[id]` (slides up) and `tutor` (a full-screen modal), all without headers.
- `app/app/index.tsx`: a spinner while hydrating, then a redirect to `/(tabs)/home` when authenticated,
  else to `/(auth)/sign-in`.
- `app/app/(auth)/`: a header-less stack of `sign-in` and `sign-up` on the dark blue background. Both trim and
  lower-case the email before sending it, show the `ApiError` message (or a connection message for another
  error) above the submit button, and link to each other. Sign in is disabled until both fields are filled;
  sign up until the email is filled and the password has 8 characters, with "At least 8 characters" shown
  under a shorter password.
- `app/app/(tabs)/_layout.tsx`: the tab bar, starting on `home`: Learn (🌼, `home`), Tutor (🎙️, `tutor`)
  and Profile (👤, `profile`); the screens are A07's and A08's.

## Tests

None. The home test (A07) renders a tab screen alone, without this layout or the store.

## Changes

none: imported

## Gate

- **A04-AC-1** — On boot the app hydrates the session with `GET /auth/me` and lands on the Learn tab when it succeeds, on sign-in otherwise. *Verify:* `app/__tests__/auth-navigation.test.tsx` ("Boot, signed in" and "Boot, signed out"), pinned by A09.
- **A04-AC-2** — Once the session becomes unauthenticated (log out, or a rejected refresh), a screen outside the auth group is replaced by sign-in. *Verify:* `app/__tests__/auth-navigation.test.tsx` ("Log out"), pinned by A09.
- **A04-AC-3** — Sign in and sign up send the email trimmed and lower-cased and, on an `ApiError`, show its message. *Verify:* unpinned.
- **A04-AC-4** — Sign up stays disabled until the password has at least 8 characters. *Verify:* unpinned.
- **A04-AC-5** — A successful login or register saves both tokens and sets the user. *Verify:* unpinned.

## Risks

- `hydrate` treats every failure, a network error or a backend that is down included, as signed out; the
  stored tokens stay and are used on the next start.
- The store's `error` field is reset but never set: the screens keep their own error state.
- The minimum password length (8) is the client's copy of the backend's rule; nothing ties them.
- Nothing navigates on a successful sign in or sign up: the store becomes `authenticated`, but the root layout
  reacts only to `unauthenticated`, and the only redirect to the tabs is in `index.tsx`, which the boot
  redirect has already replaced (expo-router's `<Redirect>` is a `router.replace`). The form stays on screen
  until the next start, when the saved tokens sign the user in.
- Nothing here is tested; a regression in the boot redirect or the bounce to sign-in shows only in a run of
  the app.
