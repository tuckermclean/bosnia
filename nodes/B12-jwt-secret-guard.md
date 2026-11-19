# B12 — jwt-secret-guard

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| now | R02, B01, B02, D03, D04 | none | S |

**Owns:** `backend/test/env.test.ts`
**Resolves:** #14

## Purpose

The production boot guard `assertProductionSecretsAreSafe()` in `backend/src/env.ts` (B02) refuses a JWT secret
only when it is unset or starts with `dev-`. The Secret template `deploy/backend-secret.example.yaml` (D03) ships
`JWT_ACCESS_SECRET: "REPLACE_WITH_LONG_RANDOM_SECRET"` and `JWT_REFRESH_SECRET:
"REPLACE_WITH_ANOTHER_LONG_RANDOM_SECRET"`, so a Secret copied from the template and never filled in boots a
production backend that signs tokens with a secret published in the repository, although `DEPLOY.md` §5 (D04)
says the guard catches exactly that case.

This node makes the guard refuse, with `DATABASE_URL` set, every JWT secret that is unset, starts with `dev-`,
contains `REPLACE_WITH`, or is shorter than 32 characters (an HS256 key of 256 bits; the template's
`openssl rand -base64 48` gives 64 characters). Local and PGlite mode, without `DATABASE_URL`, keeps the `dev-`
defaults and never trips the guard. The Secret template also lists, commented out, the voice agent's settings it
lacks, so its header's claim about what it lists holds. The four places that describe the guard, `DEPLOY.md`, the
Secret template's JWT comment, the Boot guard paragraph of `backend/README.md` (B01) and the JWT comment of the
root `.env.example` (R02), say what it refuses.

## Tests

`backend/test/env.test.ts` (vitest, no key, no database). `env.ts` parses `process.env` once, at import, so each
case sets its variables with `vi.stubEnv` (every variable the guard reads: `DATABASE_URL` and both JWT secrets,
so a developer's `.env` file changes nothing; `process.loadEnvFile` never overwrites a variable already set),
calls `vi.resetModules()`, imports `../src/env.ts` afresh and calls `assertProductionSecretsAreSafe()`;
`vi.unstubAllEnvs()` runs after each case. Cases:

- a placeholder secret (`REPLACE_WITH_...`, as long as or longer than 32 characters) in either variable, and in both;
- a short secret (31 characters) and one of exactly 32;
- a `dev-` secret and an unset one, as today;
- two real secrets (64 random characters each), which pass;
- the template's own two JWT values, read from `deploy/backend-secret.example.yaml` by line match (no YAML
  dependency is added);
- local mode (`DATABASE_URL` empty) with each of the refused values above, which never throws.

The existing backend suite runs unchanged: it sets no `DATABASE_URL` and uses the `dev-` defaults.

## Changes

- `backend/src/env.ts`: `assertProductionSecretsAreSafe()` also refuses a secret that contains `REPLACE_WITH` or
  is shorter than 32 characters (the minimum as one named constant). The error names each refused variable and
  its reason, and never contains a secret's value. The schema, its defaults, `isLocalDb` and the `.env` loading
  do not change.
- `backend/test/env.test.ts`: new, the cases above.
- `deploy/backend-secret.example.yaml`: the JWT comment states the guard's rule (unset, `dev-`, `REPLACE_WITH`,
  under 32 characters); every variable `voice-agent/config.py` reads that the template lacks is added commented
  out, each with a one-line note: `STT_PROVIDER`, `LLM_PROVIDER`, `DEEPGRAM_API_KEY`, `OPENAI_API_KEY`,
  `GROQ_STT_MODEL`, `GROQ_LLM_MODEL`, `OPENAI_LLM_MODEL`, `AZURE_TTS_VOICE`, `TUTOR_DEFAULT_LEVEL`,
  `BACKEND_TURNS_URL` and `BACKEND_TURNS_TOKEN`; the header says it lists the backend's settings that are not
  a plain default and every setting the voice agent reads, the optional ones commented out.
- `DEPLOY.md`: §5 lists what the guard refuses and when it runs; §3a's JWT item gives the 32-character minimum.
- `backend/README.md`: the Boot guard paragraph lists what the guard refuses.
- `.env.example`: the JWT comment gives the 32-character minimum for non-local mode; the `dev-` defaults and every
  other value stay as they are.

## Gate

- **B12-AC-1** — With `DATABASE_URL` set, `assertProductionSecretsAreSafe()` throws when `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` contains `REPLACE_WITH`, whatever its length, and the error names the variable (both, when both do). *Verify:* `npm test -w @bosanski/backend -- test/env.test.ts`.
- **B12-AC-2** — With `DATABASE_URL` set, it throws, naming the variable, when a JWT secret is shorter than 32 characters, and accepts one of exactly 32. *Verify:* `npm test -w @bosanski/backend -- test/env.test.ts`.
- **B12-AC-3** — With `DATABASE_URL` set, it still throws, naming the variable, for a secret that starts with `dev-` or is unset (its `dev-` default), and does not throw for two real secrets of 64 random characters. *Verify:* `npm test -w @bosanski/backend -- test/env.test.ts`.
- **B12-AC-4** — The guard's error never contains the value of a refused secret. *Verify:* `npm test -w @bosanski/backend -- test/env.test.ts`.
- **B12-AC-5** — The two JWT values of `deploy/backend-secret.example.yaml`, read from the file by the test, are each refused with `DATABASE_URL` set. *Verify:* `npm test -w @bosanski/backend -- test/env.test.ts`.
- **B12-AC-6** — With `DATABASE_URL` empty (local and PGlite mode), the guard never throws, for the `dev-` defaults, a placeholder or a short secret, and the rest of the backend suite passes with the `dev-` defaults. *Verify:* `npm test -w @bosanski/backend`.
- **B12-AC-7** — Every variable `voice-agent/config.py` reads appears in `deploy/backend-secret.example.yaml`, those the template did not list before commented out, and the file still has exactly the `stringData` keys it had (`DATABASE_URL`, the two JWT secrets, `GROQ_API_KEY`, the three LiveKit settings, `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`). *Verify:* `python3 -c "import re,sys; c=open('voice-agent/config.py').read(); t=open('deploy/backend-secret.example.yaml').read(); m=[v for v in sorted(set(re.findall(r'_(?:env|require)\(\"([A-Z_]+)\"', c))) if v not in t]; print('missing', m); sys.exit(1 if m else 0)"`, and the reviewer compares the uncommented keys with `main`.
- **B12-AC-8** — `DEPLOY.md` §5 says the guard runs only with `DATABASE_URL` set and refuses a JWT secret that is unset, starts with `dev-`, contains `REPLACE_WITH` or is shorter than 32 characters, and §3a gives the 32-character minimum; the template's JWT comment and the Boot guard paragraph of `backend/README.md` say the same, and the JWT comment of `.env.example` gives the 32-character minimum. *Verify:* the reviewer reads §5, §3a, the template comment, the README paragraph and the `.env.example` comment against `backend/src/env.ts`.

## Risks

- A running deployment whose JWT secrets are shorter than 32 characters stops booting after this change; the
  error names the variable, and `DEPLOY.md` §5 says what to set.
- The guard catches only known placeholders and short values: a long but guessable secret still passes.
- Equal access and refresh secrets are not refused; the template asks for distinct ones.
- `env` is parsed once per process, so each case must reset the module registry and its stubs; a case that
  forgets leaks its environment into the next.
- `.env.example` keeps its `dev-` defaults (R02-AC-3 relies on them); only its comment changes, so local mode is
  unaffected.
- The voice agent reads the same Secret; its added settings stay commented out, so the backend's environment
  changes only when the operator uncomments one.
