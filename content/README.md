# @bosanski/content — Bosnian curriculum pipeline

Generates the Ljiljan course as a **canonical JSON artifact** (`generated/course.json`) plus reference-audio manifest and native-speaker review tooling. The backend ingests this JSON via its `seed` script — this package never touches a database.

## Pipeline stages

| Command | What it does |
|---|---|
| `npm run blueprint` | Generate the CEFR **A1→B2** skeleton (units/skills per level) → `generated/blueprint.json`. Idempotent (`-- --force` to regenerate). |
| `npm run generate` | Per-skill: vocab, phrases, grammar tip, all 5 exercise types → `generated/skills/<id>.json`, then assemble `generated/course.json`. **Resumable** — skips skills already on disk. |
| `npm run validate` | Schema-validate, dedup vocab across skills, hygiene checks (diacritics, one correct answer, targetPhrase present). Non-zero exit on hard failures. |
| `npm run audio` | Azure `bs-BA` TTS for every listen/speak target → `audio-out/` + `manifest.json`. Content-hashed so only new text is synthesized. **Dry-run (placeholder URLs) when `AZURE_SPEECH_KEY` is unset.** |
| `npm run export-review` | Emit `review-export/<unit>.md` + `.csv` for the native-speaker review. |
| `npm run apply-review` | Apply the reviewer's CSV corrections and flip items `unreviewed → reviewed`. |
| `npm run seed-a1` | Re-emit the hand-authored A1 course (used when no LLM key is available). |
| `npm test` / `npm run typecheck` | Offline tests (MockProvider, no network) + typecheck. |

## Generating the full course
The committed content is **A1 only** and hand-authored (no LLM key was present at build time), flagged `reviewStatus: "unreviewed"`. To generate the full A1→B2 course:

```bash
export ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY — the LLM brain is pluggable
export AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=...   # optional, for real audio
npm run blueprint -w @bosanski/content
npm run generate  -w @bosanski/content
npm run validate  -w @bosanski/content
npm run audio     -w @bosanski/content
npm run export-review -w @bosanski/content   # hand this to the native speaker
# ...reviewer fills the CSV correction column...
npm run apply-review -w @bosanski/content -- <unitId>
```

## Environment
`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (pick one), `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`, optional `AZURE_TTS_VOICE` (default `bs-BA-VesnaNeural`), optional `CONTENT_DATA_ROOT` (override the `generated/`+`audio-out/` output root).

> ⚠️ All generated Bosnian is **unreviewed** until a native speaker signs off. Correctness is expected to need a review pass — that's what `export-review`/`apply-review` are for.
