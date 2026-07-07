/**
 * Stage 5b: apply a native speaker's corrections (filled into the
 * "correction" column of a unit's review-export CSV) back into the
 * generated skill files, then flip that unit's skills from
 * reviewStatus "unreviewed" -> "reviewed" and reassemble course.json.
 *
 * Correction syntax: a plain value corrects the Bosnian text; a value
 * prefixed with "en:" corrects the English gloss instead (e.g. "en:goodbye").
 * Row ids are the same stable ids export-review.ts produced
 * (`<skillId>-vocab-<n>`, `<exerciseId>-pair-<n>`, `<exerciseId>-target`).
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv } from "./csv.js";
import { SkillSchema, type Skill } from "./schema.js";
import { assembleCourse } from "./generate.js";
import { REVIEW_EXPORT_DIR, SKILLS_DIR, skillFilePath } from "./paths.js";

const SKILL_ID_RE = /^(.*-u\d+-s\d+)/;

export interface ApplyReviewResult {
  unitId: string;
  applied: number;
  skillsMarkedReviewed: string[];
}

function extractSkillId(rowId: string): string | undefined {
  return rowId.match(SKILL_ID_RE)?.[1];
}

function applyCorrectionToVocab(skill: Skill, rowId: string, correction: string): boolean {
  const m = rowId.match(/-vocab-(\d+)$/);
  if (!m) return false;
  const item = skill.vocab[Number(m[1]) - 1];
  if (!item) return false;
  if (correction.startsWith("en:")) item.en = correction.slice(3).trim();
  else item.bs = correction.trim();
  return true;
}

function applyCorrectionToPair(skill: Skill, rowId: string, correction: string): boolean {
  const m = rowId.match(/^(.*)-pair-(\d+)$/);
  if (!m) return false;
  const exerciseId = m[1]!;
  const idx = Number(m[2]) - 1;
  for (const lesson of skill.lessons) {
    for (const ex of lesson.exercises) {
      if (ex.id !== exerciseId || ex.type !== "match_pairs") continue;
      const pair = ex.pairs[idx];
      if (!pair) return false;
      if (correction.startsWith("en:")) pair.en = correction.slice(3).trim();
      else pair.bs = correction.trim();
      return true;
    }
  }
  return false;
}

function applyCorrectionToTarget(skill: Skill, rowId: string, correction: string): boolean {
  const m = rowId.match(/^(.*)-target$/);
  if (!m) return false;
  const exerciseId = m[1]!;
  for (const lesson of skill.lessons) {
    for (const ex of lesson.exercises) {
      if (ex.id !== exerciseId) continue;
      if (ex.type === "listen_choose") {
        if (correction.startsWith("en:")) ex.answer = correction.slice(3).trim();
        else ex.targetPhrase = correction.trim();
        return true;
      }
      if (ex.type === "speak") {
        if (correction.startsWith("en:")) return false; // speak has no English field
        ex.targetPhrase = correction.trim();
        return true;
      }
    }
  }
  return false;
}

export async function applyReview(unitId: string): Promise<ApplyReviewResult> {
  const csvPath = path.join(REVIEW_EXPORT_DIR, `${unitId}.csv`);
  const csvText = await readFile(csvPath, "utf-8");
  const [header, ...dataRows] = parseCsv(csvText);
  if (!header) throw new Error(`${csvPath} is empty`);

  const idIdx = header.indexOf("id");
  const correctionIdx = header.indexOf("correction");
  if (idIdx === -1 || correctionIdx === -1) {
    throw new Error(`${csvPath} is missing an "id" or "correction" column`);
  }

  const skillCache = new Map<string, Skill>();
  const loadSkill = async (skillId: string): Promise<Skill> => {
    const cached = skillCache.get(skillId);
    if (cached) return cached;
    const rawSkill = JSON.parse(await readFile(skillFilePath(skillId), "utf-8"));
    const skill = SkillSchema.parse(rawSkill);
    skillCache.set(skillId, skill);
    return skill;
  };

  let applied = 0;
  for (const row of dataRows) {
    const rowId = row[idIdx]?.trim();
    const correction = row[correctionIdx]?.trim();
    if (!rowId || !correction) continue;

    const skillId = extractSkillId(rowId);
    if (!skillId) {
      console.warn(`apply-review: could not derive skill id from row "${rowId}", skipping`);
      continue;
    }
    const skill = await loadSkill(skillId);
    const ok =
      applyCorrectionToVocab(skill, rowId, correction) ||
      applyCorrectionToPair(skill, rowId, correction) ||
      applyCorrectionToTarget(skill, rowId, correction);
    if (ok) applied += 1;
    else console.warn(`apply-review: could not locate item for row "${rowId}", skipping`);
  }

  // Every skill belonging to this unit is flipped unreviewed -> reviewed:
  // running apply-review over a unit's export IS the native-speaker sign-off.
  const allSkillFiles = (await readdir(SKILLS_DIR)).filter(
    (f) => f.startsWith(`${unitId}-s`) && f.endsWith(".json"),
  );
  const skillsMarkedReviewed: string[] = [];
  for (const file of allSkillFiles) {
    const skillId = file.replace(/\.json$/, "");
    const skill = await loadSkill(skillId);
    if (skill.reviewStatus !== "reviewed") {
      skill.reviewStatus = "reviewed";
      skillsMarkedReviewed.push(skillId);
    }
  }

  for (const [skillId, skill] of skillCache) {
    await writeFile(skillFilePath(skillId), `${JSON.stringify(skill, null, 2)}\n`, "utf-8");
  }

  await assembleCourse();

  return { unitId, applied, skillsMarkedReviewed };
}

async function main() {
  const unitId = process.argv[2];
  if (!unitId) {
    console.error("Usage: apply-review <unitId>  (reads content/review-export/<unitId>.csv)");
    process.exitCode = 1;
    return;
  }
  const result = await applyReview(unitId);
  console.log(
    `Applied ${result.applied} correction(s) to unit "${result.unitId}"; newly marked reviewed: ${result.skillsMarkedReviewed.join(", ") || "(none)"}`,
  );
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
