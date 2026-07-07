/**
 * Stage 5a: emit a human-friendly review export (Markdown + CSV) per unit,
 * for the native-speaker review pass. One row per Bosnian<->English item that
 * needs eyeballing: vocab, match_pairs, and listen_choose/speak targetPhrases.
 *
 * Row ids are stable and re-derivable from the course JSON alone
 * (`<skillId>-vocab-<n>`, `<exerciseId>-pair-<n>`, `<exerciseId>-target`), so
 * apply-review.ts can map a filled-in "correction" cell straight back to the
 * item it corrects without any extra bookkeeping file.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CourseSchema, type Unit } from "./schema.js";
import { toCsvRow } from "./csv.js";
import { COURSE_PATH, REVIEW_EXPORT_DIR } from "./paths.js";

export interface ReviewRow {
  id: string;
  bs: string;
  en: string;
  notes: string;
}

export function buildReviewRows(unit: Unit): ReviewRow[] {
  const rows: ReviewRow[] = [];

  for (const skill of unit.skills) {
    skill.vocab.forEach((v, i) => {
      rows.push({
        id: `${skill.id}-vocab-${i + 1}`,
        bs: v.bs,
        en: v.en,
        notes: `vocab · skill "${skill.title}" (${skill.titleEn})`,
      });
    });

    for (const lesson of skill.lessons) {
      for (const ex of lesson.exercises) {
        if (ex.type === "match_pairs") {
          ex.pairs.forEach((p, i) => {
            rows.push({
              id: `${ex.id}-pair-${i + 1}`,
              bs: p.bs,
              en: p.en,
              notes: `match_pairs · lesson "${lesson.title}"`,
            });
          });
        } else if (ex.type === "listen_choose") {
          rows.push({
            id: `${ex.id}-target`,
            bs: ex.targetPhrase,
            en: ex.answer,
            notes: `listen_choose target phrase · lesson "${lesson.title}"`,
          });
        } else if (ex.type === "speak") {
          rows.push({
            id: `${ex.id}-target`,
            bs: ex.targetPhrase,
            en: "",
            notes: `speak target phrase (no direct gloss) · lesson "${lesson.title}"`,
          });
        }
      }
    }
  }

  return rows;
}

export function toMarkdown(unit: Unit, rows: ReviewRow[]): string {
  const lines: string[] = [
    `# ${unit.title} (${unit.titleEn}) — ${unit.level}`,
    "",
    `Theme: ${unit.theme}`,
    "",
    "Fill in the **Correction** column where the Bosnian (or English) needs fixing.",
    'Prefix a correction with "en:" to correct the English gloss instead of the Bosnian text.',
    "",
    "| ID | Bosnian | English | Notes | Correction |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.bs.replace(/\|/g, "\\|")} | ${row.en.replace(/\|/g, "\\|")} | ${row.notes.replace(/\|/g, "\\|")} | |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function toCsv(rows: ReviewRow[]): string {
  const lines = [toCsvRow(["id", "bosnian", "english", "notes", "correction"])];
  for (const row of rows) {
    lines.push(toCsvRow([row.id, row.bs, row.en, row.notes, ""]));
  }
  return `${lines.join("\n")}\n`;
}

export async function exportReview(): Promise<{ unitIds: string[]; rowCount: number }> {
  const raw = JSON.parse(await readFile(COURSE_PATH, "utf-8"));
  const course = CourseSchema.parse(raw);

  await mkdir(REVIEW_EXPORT_DIR, { recursive: true });

  const unitIds: string[] = [];
  let rowCount = 0;

  for (const unit of course.units) {
    const rows = buildReviewRows(unit);
    rowCount += rows.length;
    await writeFile(path.join(REVIEW_EXPORT_DIR, `${unit.id}.md`), toMarkdown(unit, rows), "utf-8");
    await writeFile(path.join(REVIEW_EXPORT_DIR, `${unit.id}.csv`), toCsv(rows), "utf-8");
    unitIds.push(unit.id);
  }

  return { unitIds, rowCount };
}

async function main() {
  const result = await exportReview();
  console.log(
    `Review export complete: ${result.unitIds.length} unit(s), ${result.rowCount} row(s) -> ${REVIEW_EXPORT_DIR}`,
  );
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
