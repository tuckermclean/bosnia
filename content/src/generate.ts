/**
 * Orchestrator: ensures a blueprint exists, generates every skill it lists
 * (skipping ones already on disk), then assembles the per-skill files into
 * the single canonical course.json the backend ingests.
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { CourseSchema, SkillSchema, UnitSchema, type Course, type Unit } from "./schema.js";
import { generateBlueprint, loadCachedBlueprint } from "./blueprint.js";
import { generateSkill } from "./generate-skill.js";
import { getProvider, type LLMProvider } from "./llm.js";
import { COURSE_PATH, skillFilePath } from "./paths.js";

export interface RunGenerateOptions {
  provider?: LLMProvider;
  force?: boolean;
}

/** Read every skill file the blueprint expects and assemble course.json. */
export async function assembleCourse(): Promise<Course> {
  const blueprint = await loadCachedBlueprint();
  if (!blueprint) {
    throw new Error("No blueprint found. Run the blueprint stage first.");
  }

  const units: Unit[] = [];
  for (const unitBp of [...blueprint.units].sort((a, b) => a.order - b.order)) {
    const skills = [];
    for (const skillBp of [...unitBp.skills].sort((a, b) => a.order - b.order)) {
      const filePath = skillFilePath(skillBp.id);
      if (!existsSync(filePath)) {
        throw new Error(`Missing generated skill file for "${skillBp.id}" — run generate first.`);
      }
      const raw = JSON.parse(await readFile(filePath, "utf-8"));
      skills.push(SkillSchema.parse(raw));
    }
    units.push(
      UnitSchema.parse({
        id: unitBp.id,
        level: unitBp.level,
        order: unitBp.order,
        title: unitBp.title,
        titleEn: unitBp.titleEn,
        theme: unitBp.theme,
        skills,
      }),
    );
  }

  const course = CourseSchema.parse({ language: "bs", units });
  await writeFile(COURSE_PATH, `${JSON.stringify(course, null, 2)}\n`, "utf-8");
  return course;
}

export async function runGenerate(options: RunGenerateOptions = {}): Promise<Course> {
  const provider = options.provider ?? getProvider();
  const blueprint = options.force
    ? await generateBlueprint({ provider, force: true })
    : ((await loadCachedBlueprint()) ?? (await generateBlueprint({ provider })));

  let generated = 0;
  let skipped = 0;
  for (const unit of blueprint.units) {
    for (const skill of unit.skills) {
      const result = await generateSkill(unit, skill, { provider, force: options.force });
      if (result.skipped) skipped += 1;
      else generated += 1;
    }
  }

  const course = await assembleCourse();
  console.log(
    `Generate complete: ${generated} skill(s) generated, ${skipped} skipped (cached), ${course.units.length} unit(s) assembled.`,
  );
  return course;
}

async function main() {
  const force = process.argv.includes("--force");
  await runGenerate({ force });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
