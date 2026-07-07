/**
 * Stage 2 of the pipeline: generate the full content for a single skill —
 * vocab, example phrases, a grammar tip, and all 5 exercise types — as one
 * schema-validated JSON file. Idempotent/resumable: if the skill's file
 * already exists it is skipped (unless `force`), so a rerun after a crash or
 * a `Ctrl-C` never re-pays for work already done.
 *
 * Includes a self-review pass: after the first draft validates against the
 * schema, a second LLM call is asked to critique and correct it (translation
 * accuracy, exactly-one-correct-answer, diacritics, natural phrasing) before
 * the result is written to disk.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SkillSchema, type Skill, type SkillBlueprint, type UnitBlueprint } from "./schema.js";
import { generateJSON, getProvider, type LLMProvider } from "./llm.js";
import { SKILLS_DIR, skillFilePath } from "./paths.js";

const SYSTEM_PROMPT = `You are a native-level Bosnian curriculum writer for "Ljiljan", a language-learning
app. You write correct, natural, ijekavian standard Bosnian with full diacritics (č ć đ š ž, and the
digraphs dž lj nj). Output strict JSON only, no markdown fences, no commentary.`;

export function buildSkillPrompt(unit: UnitBlueprint, skill: SkillBlueprint): string {
  return `Write the full content for one skill of a Bosnian course.

Unit: "${unit.title}" / "${unit.titleEn}" (${unit.level}) — theme: ${unit.theme}
Skill: "${skill.title}" / "${skill.titleEn}" — grammar focus: ${skill.grammarFocus}
Target vocab count: ${skill.targetVocabCount}

Produce JSON matching exactly this shape:
{
  "id": "${skill.id}",
  "order": ${skill.order},
  "title": "${skill.title}",
  "titleEn": "${skill.titleEn}",
  "grammarTip": "<2-4 sentence explanation in English of the grammar focus, with Bosnian examples>",
  "reviewStatus": "unreviewed",
  "vocab": [ { "bs": "<Bosnian word/phrase>", "en": "<English translation>" }, ... (${skill.targetVocabCount} items) ],
  "lessons": [
    {
      "id": "${skill.id}-l1",
      "order": 1,
      "title": "<short Bosnian lesson title>",
      "exercises": [
        { "id": "${skill.id}-l1-e1", "type": "multiple_choice", "prompt", "promptEn", "answer", "choices": [4 options], "translationDirection": "en->bs" | "bs->en" },
        { "id": "${skill.id}-l1-e2", "type": "multiple_choice", ... },
        { "id": "${skill.id}-l1-e3", "type": "word_bank", "prompt", "promptEn", "answer", "choices": [tiles that must include every word in "answer"] },
        { "id": "${skill.id}-l1-e4", "type": "match_pairs", "prompt", "promptEn", "pairs": [ {"bs","en"}, ... (4 pairs) ] },
        { "id": "${skill.id}-l1-e5", "type": "listen_choose", "prompt", "promptEn", "targetPhrase", "answer", "choices": [4 options incl. the correct one exactly once] },
        { "id": "${skill.id}-l1-e6", "type": "speak", "prompt", "promptEn", "targetPhrase" }
      ]
    }
  ]
}

Rules: every exercise id is unique and follows the "<skillId>-l<lessonOrder>-e<n>" pattern; every
multiple_choice/listen_choose has exactly one choice equal to "answer"; every word_bank "choices"
array is a superset of the words in "answer"; use real, natural Bosnian throughout.`;
}

export function buildSelfReviewPrompt(draft: Skill): string {
  return `Review the following Bosnian course skill JSON for correctness and fix any problems in
place: (a) translation accuracy bs<->en, (b) exactly one correct choice for multiple_choice and
listen_choose exercises, (c) word_bank "choices" must contain every word used in "answer", (d)
natural, grammatically correct Bosnian with proper diacritics, (e) no duplicate vocab entries.
Return the corrected JSON in the exact same shape (do not change ids, do not add/remove fields).

${JSON.stringify(draft, null, 2)}`;
}

export interface GenerateSkillOptions {
  provider?: LLMProvider;
  force?: boolean;
  selfReview?: boolean; // default true; disable in tests that don't care about the second pass
}

export async function loadCachedSkill(skillId: string): Promise<Skill | undefined> {
  const filePath = skillFilePath(skillId);
  if (!existsSync(filePath)) return undefined;
  const raw = JSON.parse(await readFile(filePath, "utf-8"));
  return SkillSchema.parse(raw);
}

export async function generateSkill(
  unit: UnitBlueprint,
  skill: SkillBlueprint,
  options: GenerateSkillOptions = {},
): Promise<{ skill: Skill; skipped: boolean }> {
  await mkdir(SKILLS_DIR, { recursive: true });

  if (!options.force) {
    const cached = await loadCachedSkill(skill.id);
    if (cached) return { skill: cached, skipped: true };
  }

  const provider = options.provider ?? getProvider();
  const prompt = buildSkillPrompt(unit, skill);

  const draft = await generateJSON(provider, prompt, (raw) => SkillSchema.parse(raw), {
    system: SYSTEM_PROMPT,
    maxTokens: 8192,
  });

  let final = draft;
  if (options.selfReview !== false) {
    try {
      final = await generateJSON(
        provider,
        buildSelfReviewPrompt(draft),
        (raw) => SkillSchema.parse(raw),
        { system: SYSTEM_PROMPT, maxTokens: 8192 },
      );
    } catch {
      // Self-review is best-effort: fall back to the validated draft if the
      // review pass fails or returns something that doesn't parse.
      final = draft;
    }
  }

  const filePath = skillFilePath(skill.id);
  await writeFile(filePath, `${JSON.stringify(final, null, 2)}\n`, "utf-8");
  return { skill: final, skipped: false };
}
