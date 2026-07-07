/**
 * Stage 1 of the pipeline: generate the CEFR A1->B2 skeleton (ordered units and
 * skills per level, each with a theme, target vocab count, and grammar focus).
 * This is the backbone that keeps difficulty progression coherent across the
 * whole course; per-skill content generation (generate-skill.ts) reads it.
 *
 * Cached to generated/blueprint.json. Idempotent: a second run without --force
 * returns the cached blueprint without calling the LLM again.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { BlueprintSchema, type Blueprint, type CEFRLevel } from "./schema.js";
import { generateJSON, getProvider, type LLMProvider } from "./llm.js";
import { BLUEPRINT_PATH, GENERATED_DIR } from "./paths.js";

const ALL_LEVELS: CEFRLevel[] = ["A1", "A2", "B1", "B2"];

const SYSTEM_PROMPT = `You are a CEFR curriculum designer building the Bosnian-language course for
"Ljiljan", a language-learning app. Output strict JSON only, no markdown fences, no commentary.`;

export function buildBlueprintPrompt(levels: CEFRLevel[]): string {
  return `Design a CEFR-aligned course skeleton for Bosnian (language code "bs") covering levels: ${levels.join(", ")}.

For each level produce several ordered units (thematic groupings, e.g. greetings, daily routine,
travel, work, opinions...), and for each unit produce several ordered skills. Each skill needs:
- id: stable kebab-case string like "a1-u1-s1" (level lowercase + unit index + skill index)
- order: integer position within the unit, starting at 1
- title: the skill name in Bosnian
- titleEn: the skill name in English
- grammarFocus: the primary grammar point the skill drills (short phrase)
- targetVocabCount: how many vocabulary items the skill should end up with (8-14)

Each unit needs: id (e.g. "a1-u1"), level, order, title (Bosnian), titleEn (English), theme
(one sentence describing the unit's topic/scenario), and skills (array as above).

Return JSON matching exactly:
{
  "language": "bs",
  "levels": [${levels.map((l) => `"${l}"`).join(", ")}],
  "units": [ { "id", "level", "order", "title", "titleEn", "theme", "skills": [ { "id", "order", "title", "titleEn", "grammarFocus", "targetVocabCount" } ] } ]
}

Difficulty must progress: A1 is absolute-beginner survival Bosnian; B2 is complex opinions,
hypotheticals, and abstract topics. IDs must be unique and stable across runs.`;
}

export interface GenerateBlueprintOptions {
  provider?: LLMProvider;
  levels?: CEFRLevel[];
  force?: boolean;
}

/** Load the cached blueprint from disk, if present. */
export async function loadCachedBlueprint(): Promise<Blueprint | undefined> {
  if (!existsSync(BLUEPRINT_PATH)) return undefined;
  const raw = JSON.parse(await readFile(BLUEPRINT_PATH, "utf-8"));
  return BlueprintSchema.parse(raw);
}

export async function generateBlueprint(options: GenerateBlueprintOptions = {}): Promise<Blueprint> {
  await mkdir(GENERATED_DIR, { recursive: true });

  if (!options.force) {
    const cached = await loadCachedBlueprint();
    if (cached) return cached;
  }

  const provider = options.provider ?? getProvider();
  const levels = options.levels ?? ALL_LEVELS;
  const prompt = buildBlueprintPrompt(levels);

  const blueprint = await generateJSON(provider, prompt, (raw) => BlueprintSchema.parse(raw), {
    system: SYSTEM_PROMPT,
    maxTokens: 8192,
  });

  await writeFile(BLUEPRINT_PATH, `${JSON.stringify(blueprint, null, 2)}\n`, "utf-8");
  return blueprint;
}

async function main() {
  const force = process.argv.includes("--force");
  const blueprint = await generateBlueprint({ force });
  const skillCount = blueprint.units.reduce((sum, u) => sum + u.skills.length, 0);
  console.log(
    `Blueprint ready (${blueprint.units.length} units, ${skillCount} skills across levels ${blueprint.levels.join(", ")}) -> ${BLUEPRINT_PATH}`,
  );
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
