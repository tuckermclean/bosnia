/**
 * Stage 3: schema-validate the assembled course, then run hygiene checks:
 *  - vocab dedup across skills (exact bs+en duplicate = hard error; same bs
 *    word with a different en translation across skills = warning)
 *  - non-empty translations everywhere
 *  - multiple_choice / listen_choose have exactly one correct answer among
 *    their choices, and no duplicate choices
 *  - word_bank "choices" tiles can actually build "answer"
 *  - every listen_choose / speak exercise has a targetPhrase
 *  - Bosnian diacritics (č ć đ š ž, dž lj nj) appear somewhere in the course
 *
 * Exits non-zero on hard failures so this can gate CI.
 */
import { readFile } from "node:fs/promises";
import { CourseSchema, type Course, type Exercise } from "./schema.js";
import { COURSE_PATH } from "./paths.js";

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  level: IssueLevel;
  message: string;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  ok: boolean;
}

const DIACRITICS = ["č", "ć", "đ", "š", "ž"];
const DIGRAPHS = ["dž", "lj", "nj"];

function normWords(s: string): string[] {
  return s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function exerciseText(ex: Exercise): string[] {
  const parts: string[] = [ex.prompt];
  if (ex.promptEn) parts.push(ex.promptEn);
  switch (ex.type) {
    case "multiple_choice":
    case "word_bank":
      parts.push(ex.answer, ...ex.choices);
      break;
    case "match_pairs":
      for (const p of ex.pairs) parts.push(p.bs, p.en);
      break;
    case "listen_choose":
      parts.push(ex.answer, ...ex.choices, ex.targetPhrase);
      break;
    case "speak":
      parts.push(ex.targetPhrase);
      break;
  }
  return parts;
}

export function validateCourse(course: Course): ValidationReport {
  const issues: ValidationIssue[] = [];

  // key: bs word lowercased -> list of {en, skillId} seen so far
  const vocabIndex = new Map<string, Array<{ en: string; skillId: string }>>();

  const corpusParts: string[] = [];

  for (const unit of course.units) {
    corpusParts.push(unit.title, unit.theme);
    for (const skill of unit.skills) {
      corpusParts.push(skill.title, skill.grammarTip);

      for (const v of skill.vocab) {
        if (!v.bs.trim() || !v.en.trim()) {
          issues.push({
            level: "error",
            message: `${skill.id}: vocab item has an empty translation (bs="${v.bs}", en="${v.en}")`,
          });
        }
        corpusParts.push(v.bs);

        const key = v.bs.trim().toLowerCase();
        const seen = vocabIndex.get(key) ?? [];
        const exactDup = seen.find(
          (s) => s.en.trim().toLowerCase() === v.en.trim().toLowerCase() && s.skillId !== skill.id,
        );
        if (exactDup) {
          issues.push({
            level: "error",
            message: `Duplicate vocab "${v.bs}" = "${v.en}" appears in both ${exactDup.skillId} and ${skill.id}`,
          });
        } else if (seen.length > 0 && !seen.some((s) => s.skillId === skill.id)) {
          issues.push({
            level: "warning",
            message: `Vocab word "${v.bs}" appears in multiple skills (${[...seen.map((s) => s.skillId), skill.id].join(", ")}) — verify translations agree`,
          });
        }
        seen.push({ en: v.en, skillId: skill.id });
        vocabIndex.set(key, seen);
      }

      for (const lesson of skill.lessons) {
        for (const ex of lesson.exercises) {
          corpusParts.push(...exerciseText(ex));

          if (!ex.prompt.trim()) {
            issues.push({ level: "error", message: `${ex.id}: empty prompt` });
          }

          if (ex.type === "multiple_choice" || ex.type === "listen_choose") {
            const normalizedAnswer = ex.answer.trim().toLowerCase();
            const matches = ex.choices.filter((c) => c.trim().toLowerCase() === normalizedAnswer);
            if (matches.length !== 1) {
              issues.push({
                level: "error",
                message: `${ex.id}: expected exactly one choice equal to "answer", found ${matches.length}`,
              });
            }
            const uniq = new Set(ex.choices.map((c) => c.trim().toLowerCase()));
            if (uniq.size !== ex.choices.length) {
              issues.push({ level: "error", message: `${ex.id}: duplicate entries in choices` });
            }
          }

          if (ex.type === "word_bank") {
            const tiles = new Set(ex.choices.map((c) => c.trim().toLowerCase()));
            const missing = normWords(ex.answer).filter((w) => !tiles.has(w));
            if (missing.length > 0) {
              issues.push({
                level: "error",
                message: `${ex.id}: word_bank "answer" needs tiles not present in "choices": ${missing.join(", ")}`,
              });
            }
          }

          if ((ex.type === "listen_choose" || ex.type === "speak") && !ex.targetPhrase.trim()) {
            issues.push({ level: "error", message: `${ex.id}: ${ex.type} is missing targetPhrase` });
          }
        }
      }
    }
  }

  const corpus = corpusParts.join(" \n ").toLowerCase();
  for (const d of DIACRITICS) {
    if (!corpus.includes(d)) {
      issues.push({ level: "error", message: `Diacritic "${d}" not found anywhere in the course` });
    }
  }
  for (const dg of DIGRAPHS) {
    if (!corpus.includes(dg)) {
      issues.push({ level: "error", message: `Digraph "${dg}" not found anywhere in the course` });
    }
  }

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warningCount = issues.filter((i) => i.level === "warning").length;
  return { issues, errorCount, warningCount, ok: errorCount === 0 };
}

export function formatReport(report: ValidationReport): string {
  const lines: string[] = [];
  for (const issue of report.issues) {
    lines.push(`[${issue.level.toUpperCase()}] ${issue.message}`);
  }
  lines.push(
    `\n${report.errorCount} error(s), ${report.warningCount} warning(s) — ${report.ok ? "PASS" : "FAIL"}`,
  );
  return lines.join("\n");
}

async function main() {
  const raw = JSON.parse(await readFile(COURSE_PATH, "utf-8"));
  const course = CourseSchema.parse(raw);
  const report = validateCourse(course);
  console.log(formatReport(report));
  if (!report.ok) process.exitCode = 1;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
