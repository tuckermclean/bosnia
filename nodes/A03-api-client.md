# A03 — api-client

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | A01, B05, B07, B08, B09, B10 | A04, A05, A06, A07, A08, A11, A12 | M |

**Owns:** `app/src/api/`, `app/src/types/`, `app/src/hooks/`, `app/src/constants.ts`

## Purpose

Imported from the code. The app's side of the backend's `/api` contract: the HTTP client, the token store,
the calls per resource, the wire types, and the TanStack Query layer the screens read from. It talks only
to the backend (auth B05, courses and progress B07, pronunciation B08, tutor sessions B09, the error shape
of B10) and holds no key (principle 1).

- `app/src/api/config.ts`: the base URL is `EXPO_PUBLIC_API_BASE_URL`, else `expo.extra.apiBaseUrl` (A01's
  `app.json`), else `http://localhost:3000`, with one trailing `/` stripped; `apiUrl(path)` is the base,
  `/api`, and the path with a leading `/` added when missing.
- `app/src/api/tokenStorage.ts` keeps the access and refresh tokens in `expo-secure-store` under
  `ljiljan.accessToken` and `ljiljan.refreshToken` (save, get each, clear both).
- `app/src/api/client.ts`:
  - `apiRequest(path, options)` sends JSON (or a given `FormData`, without a JSON content type) with
    `Authorization: Bearer <access token>` unless `skipAuth` is set or the path starts with `/auth/login`,
    `/auth/register` or `/auth/refresh`.
  - On a 401 of an authenticated request it refreshes once and retries once with the new token. The refresh
    posts the stored refresh token to `/auth/refresh` and saves the returned pair; concurrent 401s share one
    refresh. With no stored refresh token, or when the server rejects the refresh, it clears the tokens and
    calls the handler registered with `registerAuthExpiredHandler` (A04's store); a network error during the
    refresh returns no token and does neither.
  - A non-2xx answer throws `ApiError(status, message, body)`, the message taken from the body's `error`,
    else its `message`, else `Request failed with status <n>`. A 204 returns `undefined`; other bodies are
    parsed as JSON, or returned as text when they are not JSON.
  - `api.get/post/put/patch/del` wrap it.
- `app/src/api/auth.ts` (`register`, `login`, `me`), `courses.ts` (`getCourses` returns the `courses`
  array, `getLesson`), `progress.ts` (`getProgress`, `completeLesson` to `/progress/lesson-complete`),
  `pronunciation.ts` (`submitPronunciation` posts multipart `audio` as a React Native `{uri, name, type}`
  file, default `audio/m4a`, with `targetPhrase` and an optional `exerciseId`), `tutor.ts`
  (`startTutorSession` posts `{level, scenario}` to `/tutor/session`); `index.ts` re-exports them as
  `authApi`, `coursesApi`, `progressApi`, `pronunciationApi` and `tutorApi`.
- `app/src/api/queryClient.ts`: queries retry up to twice except on a 4xx `ApiError`, stay fresh for 30 s;
  mutations never retry.
- `app/src/types/api.ts`: hand-kept mirrors of the backend's responses (user and tokens, the course tree
  with units, skills and lessons, a lesson with its exercises and their payloads, the five exercise types,
  stats and skill progress, lesson-complete, the pronunciation result with per-word scores, the tutor
  session with an optional `sessionId`, and the CEFR levels A1 to B2).
- `app/src/hooks/`: `useCourses` (`['courses']`), `useLesson(id)` (`['lesson', id]`, only with an id),
  `useProgress` (`['progress']`), `useCompleteLesson` (invalidates `progress` and `courses` on success),
  `useSubmitPronunciation`, and `useTutorSession(level, scenario)`, a query that is never cached, never
  retried and not refetched on focus, so each mount asks for a new room.
- `app/src/constants.ts`: `MAX_HEARTS` 5, `MAX_CROWN_LEVEL` 5 and `PASS_RATIO` 0.6, copies of the backend's
  values in `backend/src/routes/progress.ts` (B07).

## Tests

`app/src/api/__tests__/client.test.ts`: the error message mapping, and the 401 refresh-and-retry and the
two logout paths, with `fetch` and the token store mocked. `app/src/api/__tests__/config.test.ts`: `apiUrl`
with and without a trailing slash in the base URL.

## Changes

none: imported

## Gate

- **A03-AC-1** — An error answer's `ApiError` message is the body's `error`, preferred over `message`, else `message`, else `Request failed with status <n>`. *Verify:* `app/src/api/__tests__/client.test.ts` ("takes ApiError.message from a `{ error }` response body, not `message`"), `app/src/api/__tests__/client.test.ts` ("falls back to `message` and then a generic status message when `error` is absent"), `app/src/api/__tests__/client.test.ts` ("prefers `error` over `message` when a body somehow has both").
- **A03-AC-2** — A 401 on an authenticated request makes one more request, saves the token pair it returns, and retries the request once with the new bearer token. *Verify:* `app/src/api/__tests__/client.test.ts` ("refreshes the access token once on a 401 and retries the original request").
- **A03-AC-3** — With no stored refresh token, a 401 clears the tokens and calls the auth-expired handler, without a refresh request. *Verify:* `app/src/api/__tests__/client.test.ts` ("logs the user out (clears tokens + fires the auth-expired handler) when there is no refresh token").
- **A03-AC-4** — When the server rejects the refresh token, the client clears the tokens and calls the auth-expired handler. *Verify:* `app/src/api/__tests__/client.test.ts` ("logs the user out when the stored refresh token is itself rejected by the server").
- **A03-AC-5** — `apiUrl` puts exactly one `/` between the base URL and `/api`, with or without a trailing slash in the base. *Verify:* `app/src/api/__tests__/config.test.ts` ("produces exactly one slash between the host and /api when the base URL has no trailing slash"), `app/src/api/__tests__/config.test.ts` ("strips a trailing slash from the base URL so it does not produce a double slash").
- **A03-AC-6** — Concurrent 401s share one refresh request. *Verify:* unpinned.
- **A03-AC-7** — Login, register and refresh are sent without an `Authorization` header. *Verify:* unpinned.
- **A03-AC-8** — Queries are not retried after a 4xx `ApiError`; mutations are never retried. *Verify:* unpinned.
- **A03-AC-9** — A completed lesson invalidates the cached progress and courses. *Verify:* unpinned.
- **A03-AC-10** — A pronunciation upload is multipart with the `audio` file, `targetPhrase` and, when given, `exerciseId`. *Verify:* unpinned.

## Risks

- `expo-secure-store` has no web implementation, so tokens cannot be stored in the web build (OD1).
- The wire types and the three constants are copied by hand from the backend; nothing checks that they still
  match it.
- A network error during a refresh neither logs out nor retries: the original 401 surfaces as an `ApiError`.
- Every request without `FormData` carries `Content-Type: application/json`, a body-less POST included,
  which the backend answers 500 (B10's risk); today's calls always send a body.
- The access token is read from SecureStore on every request.
- `submitPronunciation` adds the audio to the form as a plain `{uri, name, type}` object labelled `audio/m4a`
  whatever the recorder produced. React Native's networking reads that object as a file; in a browser,
  `FormData` stores it as the string `[object Object]`. The upload as written is native-only (principle 8).
- `useTutorSession`'s key includes the level, so a level change while the call screen is mounted asks for a
  second room.
