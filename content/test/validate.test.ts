import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { CourseSchema, type Course } from "../src/schema.js";
import { validateCourse } from "../src/validate.js";
import { COURSE_PATH } from "../src/paths.js";

/** A minimal, fully schema-valid course fixture covering every exercise type. */
function makeGoodCourse(): Course {
  return {
    language: "bs",
    units: [
      {
        id: "a1-u1",
        level: "A1",
        order: 1,
        title: "Predstavljanje",
        titleEn: "Introductions",
        theme: "Greetings and introductions.",
        skills: [
          {
            id: "a1-u1-s1",
            order: 1,
            title: "Pozdravi",
            titleEn: "Greetings",
            grammarTip: "Njegov/njena show possession; noć and veče carry the ć/č diacritics.",
            reviewStatus: "unreviewed",
            vocab: [
              { bs: "hvala", en: "thank you" },
              { bs: "doviđenja", en: "goodbye" },
              { bs: "žut", en: "yellow" },
              { bs: "narandžast", en: "orange" },
              { bs: "ljubičast", en: "purple" },
            ],
            lessons: [
              {
                id: "a1-u1-s1-l1",
                order: 1,
                title: "Osnovni pozdravi",
                exercises: [
                  {
                    id: "a1-u1-s1-l1-e1",
                    type: "multiple_choice",
                    prompt: "Kako se kaže 'hello'?",
                    answer: "zdravo",
                    choices: ["zdravo", "hvala", "doviđenja"],
                  },
                  {
                    id: "a1-u1-s1-l1-e2",
                    type: "word_bank",
                    prompt: "Sastavi: 'good evening'",
                    answer: "dobro veče",
                    choices: ["dobro", "veče", "jutro"],
                  },
                  {
                    id: "a1-u1-s1-l1-e3",
                    type: "match_pairs",
                    prompt: "Spoji parove",
                    pairs: [
                      { bs: "hvala", en: "thank you" },
                      { bs: "doviđenja", en: "goodbye" },
                    ],
                  },
                  {
                    id: "a1-u1-s1-l1-e4",
                    type: "listen_choose",
                    prompt: "Poslušaj i odaberi",
                    targetPhrase: "Dobro jutro",
                    answer: "Good morning",
                    choices: ["Good morning", "Good night"],
                  },
                  {
                    id: "a1-u1-s1-l1-e5",
                    type: "speak",
                    prompt: "Izgovori naglas",
                    targetPhrase: "Laku noć",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("CourseSchema", () => {
  it("accepts a well-formed course", () => {
    const result = CourseSchema.safeParse(makeGoodCourse());
    expect(result.success).toBe(true);
  });

  it("rejects an exercise with an unknown type", () => {
    const bad = makeGoodCourse();
    // @ts-expect-error deliberately invalid for the test
    bad.units[0].skills[0].lessons[0].exercises[0].type = "translate";
    const result = CourseSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a multiple_choice exercise missing choices", () => {
    const bad = makeGoodCourse();
    // @ts-expect-error deliberately invalid for the test
    delete bad.units[0].skills[0].lessons[0].exercises[0].choices;
    const result = CourseSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a course with an empty units array", () => {
    const result = CourseSchema.safeParse({ language: "bs", units: [] });
    expect(result.success).toBe(false);
  });
});

describe("validateCourse", () => {
  it("passes a well-formed course with no issues", () => {
    const report = validateCourse(makeGoodCourse());
    expect(report.ok).toBe(true);
    expect(report.errorCount).toBe(0);
  });

  it("flags exact duplicate vocab across two skills as a warning, not a hard error", () => {
    // Cross-skill repetition of the same word/translation is intentional
    // (spaced-repetition / spiraling curriculum across CEFR levels), so it
    // must not fail CI — see the matching comment in validate.ts.
    const course = makeGoodCourse();
    const dupSkill = structuredClone(course.units[0]!.skills[0]!);
    dupSkill.id = "a1-u1-s2";
    dupSkill.lessons[0]!.id = "a1-u1-s2-l1";
    dupSkill.lessons[0]!.exercises.forEach((e, i) => (e.id = `a1-u1-s2-l1-e${i + 1}`));
    course.units[0]!.skills.push(dupSkill);

    const report = validateCourse(course);
    expect(report.ok).toBe(true);
    expect(
      report.issues.some((i) => i.level === "warning" && /Duplicate vocab/.test(i.message)),
    ).toBe(true);
  });

  it("flags a multiple_choice exercise with zero or duplicate correct answers", () => {
    const course = makeGoodCourse();
    const ex = course.units[0]!.skills[0]!.lessons[0]!.exercises[0]!;
    if (ex.type === "multiple_choice") {
      ex.choices = ["hvala", "doviđenja"]; // "zdravo" (the answer) is missing entirely
    }
    const report = validateCourse(course);
    expect(report.ok).toBe(false);
    expect(
      report.issues.some((i) => i.level === "error" && /exactly one choice/.test(i.message)),
    ).toBe(true);
  });

  it("flags a word_bank exercise whose choices can't build the answer", () => {
    const course = makeGoodCourse();
    const ex = course.units[0]!.skills[0]!.lessons[0]!.exercises[1]!;
    if (ex.type === "word_bank") {
      ex.choices = ["dobro"]; // missing the tile for "veče"
    }
    const report = validateCourse(course);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.level === "error" && /word_bank/.test(i.message))).toBe(
      true,
    );
  });

  it("flags a course missing a required Bosnian diacritic/digraph", () => {
    const course: Course = {
      language: "bs",
      units: [
        {
          id: "a1-u1",
          level: "A1",
          order: 1,
          title: "Osnove",
          titleEn: "Basics",
          theme: "Plain ASCII only, no diacritics anywhere in this fixture.",
          skills: [
            {
              id: "a1-u1-s1",
              order: 1,
              title: "Osnove",
              titleEn: "Basics",
              grammarTip: "Plain ASCII grammar tip with no special characters.",
              reviewStatus: "unreviewed",
              vocab: [{ bs: "auto", en: "car" }],
              lessons: [
                {
                  id: "a1-u1-s1-l1",
                  order: 1,
                  title: "Lekcija",
                  exercises: [
                    {
                      id: "a1-u1-s1-l1-e1",
                      type: "speak",
                      prompt: "Reci",
                      targetPhrase: "auto",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const report = validateCourse(course);
    expect(report.ok).toBe(false);
    expect(report.issues.filter((i) => /Diacritic|Digraph/.test(i.message)).length).toBeGreaterThan(
      0,
    );
  });
});

describe("committed A1 content (integration)", () => {
  it("the checked-in generated/course.json passes validation cleanly", async () => {
    const raw = JSON.parse(await readFile(COURSE_PATH, "utf-8"));
    const course = CourseSchema.parse(raw);
    const report = validateCourse(course);
    if (!report.ok) {
      console.error(report.issues);
    }
    expect(report.errorCount).toBe(0);
    expect(course.units.length).toBeGreaterThan(0);
  });
});
