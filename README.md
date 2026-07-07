# Ljiljan — learn Bosnian 🌼

A mobile app for learning **Bosnian**: a Duolingo-style gamified lesson engine, an **AI pronunciation grader** that listens and scores you, and a **real-time Bosnian voice tutor** you can actually talk to.

Named for the *zlatni ljiljan* (golden lily), a Bosnian national symbol. Original branding — not affiliated with Duolingo.

## Monorepo layout

| Package        | Stack                        | Responsibility |
|----------------|------------------------------|----------------|
| `app/`         | Expo (React Native + TS)     | The mobile client: skill tree, lessons, pronunciation UI, voice-tutor call screen. |
| `backend/`     | Fastify + Drizzle + Postgres | API, auth, progress sync, and the server-side proxy for the AI APIs (keys never ship to the client). |
| `voice-agent/` | Python + LiveKit Agents      | The real-time full-duplex Bosnian voice tutor (VAD → STT → LLM → Azure `bs-BA` TTS). |
| `content/`     | TypeScript pipeline          | Generates the CEFR A1→B2 Bosnian curriculum + reference audio + native-speaker review tooling. |

## How the pieces fit

```
                 ┌─────────────┐   POST /api/pronunciation        ┌────────────┐
  ┌──────────┐   │             │──(audio)────────────────────────▶│  Groq      │
  │  app     │──▶│  backend    │◀─(transcript)────────────────────│  Whisper   │
  │ (Expo)   │   │  (Fastify)  │   scorePronunciation() → 0–100    └────────────┘
  │          │   │             │
  │          │   │             │   POST /api/tutor/session → LiveKit token
  │          │   └─────────────┘
  │          │        │ join room (LiveKit)         ┌──────────────┐
  │          │········│·····························▶│ voice-agent  │  Azure bs-BA TTS
  └──────────┘   real-time voice (WebRTC)           │ (LiveKit)    │  fast LLM brain
                                                     └──────────────┘
  content/ ──(course.json + audio manifest)──▶ backend seed ──▶ Postgres ──▶ /api/courses
```

## Key decisions & honest caveats
- **AI keys stay server-side.** The app only ever talks to `backend/`; the backend holds Groq/LiveKit/Azure secrets.
- **Pronunciation scoring is coarse.** Whisper emits clean text and can silently "correct" a mispronunciation, so transcript-vs-target scoring is a useful-but-approximate signal. A phoneme forced-alignment upgrade is a future phase. The scoring core is pure and unit-tested (`backend/src/services/scoring.ts`).
- **Bosnian voice authenticity > raw latency.** We chose a streaming STT→LLM→Azure `bs-BA` TTS pipeline over a native speech-to-speech model, because the tutor is the voice learners imitate.
- **Generated content ships `unreviewed`.** The curriculum is AI/hand-generated and flagged until a native Bosnian speaker signs off; `content/` emits a review export and an apply-back importer for exactly that.

## Local development
No Docker required — the backend uses **PGlite** (in-process Postgres) locally and for tests; set `DATABASE_URL` to use a real Postgres in production. Copy `.env.example` → `.env` and fill in keys for the features you want to exercise.

```bash
npm install                 # installs backend + content workspaces
npm test -w @bosanski/backend
npm run dev -w @bosanski/backend
```

See each package's own README for its run instructions.
