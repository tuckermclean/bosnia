# Ljiljan — mobile app (Expo / React Native)

The learner-facing client: skill tree, gamified lessons, the pronunciation grader, and the real-time Bosnian voice tutor. Original **Ljiljan** (golden-lily) branding — not a Duolingo clone.

## Run

```bash
cd app
npm install
cp .env.example .env          # set EXPO_PUBLIC_API_BASE_URL to your backend
npx expo start                # then press i / a, or scan the QR with Expo Go
```

The backend must be running (see `../backend`). On a physical device, set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP (not `localhost`).

## Stack
- **expo-router** file-based navigation (`app/` dir: `(auth)`, `(tabs)`, `lesson/[id]`, `tutor`)
- **Zustand** session state · **TanStack Query** server cache · **expo-secure-store** for JWT access/refresh (auto-refresh on 401)
- **expo-audio** (record + playback) · **react-native-reanimated** · **@livekit/react-native** for the voice tutor call

## Structure
- `src/api/*` — typed backend client + per-resource calls (points at the backend API contract)
- `src/features/lesson/exercises/*` — one component per exercise type (multiple_choice, word_bank, match_pairs, listen_choose, speak)
- `src/features/pronunciation/RecordExercise.tsx` — record → `POST /api/pronunciation` → score + per-word highlight
- `src/features/tutor/VoiceCall.tsx` — `POST /api/tutor/session` → connect via LiveKit → live call with barge-in
- `src/features/home/*` — the skill tree · `src/components/*` + `src/theme/tokens.ts` — design system

## Tests / checks
```bash
npx tsc --noEmit     # typecheck
npx jest             # component + API-client tests
```

## Notes
- The real voice tutor and pronunciation grader require the backend to have its Groq / LiveKit / Azure keys set; a full voice run also needs LiveKit Cloud and a device mic.
- Reference audio URLs are `PLACEHOLDER://` until the content package's Azure TTS step has been run — the "listen" affordance soft-fails gracefully in that case.
