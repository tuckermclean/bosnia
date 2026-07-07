/**
 * One-off hand-authoring script: no LLM key was available in this environment,
 * so this writes a genuine, hand-crafted A1 Bosnian unit directly — not
 * placeholder text. It reuses the pipeline's own Zod schemas so the output is
 * guaranteed to match the canonical course JSON contract exactly, and writes
 * to the same locations the real (LLM-driven) pipeline would:
 *   content/generated/blueprint.json
 *   content/generated/skills/a1-u1-s{1..5}.json
 *   content/generated/course.json
 *
 * All content is flagged reviewStatus: "unreviewed" — a native speaker
 * reviews it via `npm run export-review` / `npm run apply-review`.
 *
 * Run once with: npx tsx scripts/seed-a1.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import {
  BlueprintSchema,
  CourseSchema,
  SkillSchema,
  UnitSchema,
  type Blueprint,
  type Course,
  type Skill,
} from "../src/schema.js";
import { BLUEPRINT_PATH, COURSE_PATH, GENERATED_DIR, SKILLS_DIR, skillFilePath } from "../src/paths.js";

// ── Skill 1: Pozdravi (Greetings) ────────────────────────────────────────────

const skill1: Skill = {
  id: "a1-u1-s1",
  order: 1,
  title: "Pozdravi",
  titleEn: "Greetings",
  grammarTip:
    "Bosnian distinguishes informal address (ti) from formal or plural address (vi): 'Kako si?' " +
    "(asking one person you're informal with) vs 'Kako ste?' (formal, or speaking to more than one " +
    "person). The word 'molim' does double duty — it means 'please' when asking for something, and " +
    "'you're welcome' when replying to 'hvala'.",
  reviewStatus: "unreviewed",
  vocab: [
    { bs: "zdravo", en: "hello" },
    { bs: "dobar dan", en: "good day / hello" },
    { bs: "dobro jutro", en: "good morning" },
    { bs: "dobro veče", en: "good evening" },
    { bs: "laku noć", en: "good night" },
    { bs: "doviđenja", en: "goodbye" },
    { bs: "ćao", en: "bye / hi (informal)" },
    { bs: "kako si", en: "how are you (informal)" },
    { bs: "kako ste", en: "how are you (formal / plural)" },
    { bs: "hvala", en: "thank you" },
    { bs: "molim", en: "please / you're welcome" },
    { bs: "izvini", en: "sorry, excuse me (informal)" },
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
          prompt: "Kako se kaže 'hello' na bosanskom?",
          promptEn: "How do you say 'hello' in Bosnian?",
          answer: "zdravo",
          choices: ["zdravo", "hvala", "doviđenja", "molim"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s1-l1-e2",
          type: "multiple_choice",
          prompt: "Šta znači riječ 'hvala'?",
          promptEn: "What does the word 'hvala' mean?",
          answer: "thank you",
          choices: ["thank you", "goodbye", "please", "sorry"],
          translationDirection: "bs->en",
        },
        {
          id: "a1-u1-s1-l1-e3",
          type: "word_bank",
          prompt: "Sastavi frazu: 'Good evening'",
          promptEn: "Build the phrase: 'Good evening'",
          answer: "dobro veče",
          choices: ["dobro", "veče", "jutro", "noć", "dan"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s1-l1-e4",
          type: "match_pairs",
          prompt: "Spoji bosanske riječi s engleskim prijevodom.",
          promptEn: "Match the Bosnian words with their English translation.",
          pairs: [
            { bs: "zdravo", en: "hello" },
            { bs: "hvala", en: "thank you" },
            { bs: "doviđenja", en: "goodbye" },
            { bs: "molim", en: "please" },
          ],
        },
        {
          id: "a1-u1-s1-l1-e5",
          type: "listen_choose",
          prompt: "Poslušaj i odaberi tačan prijevod.",
          promptEn: "Listen and choose the correct translation.",
          targetPhrase: "Dobro jutro",
          answer: "Good morning",
          choices: ["Good morning", "Good night", "Good evening", "Goodbye"],
        },
        {
          id: "a1-u1-s1-l1-e6",
          type: "speak",
          prompt: "Izgovori naglas.",
          promptEn: "Say it out loud.",
          targetPhrase: "Laku noć",
        },
      ],
    },
  ],
};

// ── Skill 2: Predstavljanje (Introductions) ─────────────────────────────────

const skill2: Skill = {
  id: "a1-u1-s2",
  order: 2,
  title: "Predstavljanje",
  titleEn: "Introductions",
  grammarTip:
    "Present tense of 'biti' (to be): ja sam, ti si, on/ona/ono je, mi smo, vi ste, oni/one su. " +
    "Bosnian also uses reflexive verbs with 'se' — 'zvati se' (to be called): 'Kako se zoveš?' / " +
    "'Zovem se...'. Keep the informal/formal split in mind: 'zoveš' (ti) vs 'zovete' (vi).",
  reviewStatus: "unreviewed",
  vocab: [
    { bs: "Ja sam...", en: "I am..." },
    { bs: "Kako se zoveš?", en: "What's your name? (informal)" },
    { bs: "Kako se zovete?", en: "What's your name? (formal)" },
    { bs: "Zovem se...", en: "My name is..." },
    { bs: "Drago mi je", en: "Nice to meet you" },
    { bs: "Odakle si?", en: "Where are you from? (informal)" },
    { bs: "Ja sam iz...", en: "I am from..." },
    { bs: "Koliko imaš godina?", en: "How old are you? (informal)" },
    { bs: "Imam ... godina", en: "I am ... years old" },
    { bs: "prijatelj", en: "friend (male)" },
    { bs: "prijateljica", en: "friend (female)" },
  ],
  lessons: [
    {
      id: "a1-u1-s2-l1",
      order: 1,
      title: "Upoznavanje",
      exercises: [
        {
          id: "a1-u1-s2-l1-e1",
          type: "multiple_choice",
          prompt: "Kako se kaže 'Nice to meet you'?",
          promptEn: "How do you say 'Nice to meet you'?",
          answer: "Drago mi je",
          choices: ["Drago mi je", "Zovem se", "Odakle si", "Kako si"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s2-l1-e2",
          type: "multiple_choice",
          prompt: "Šta znači 'Odakle si?'",
          promptEn: "What does 'Odakle si?' mean?",
          answer: "Where are you from?",
          choices: [
            "Where are you from?",
            "How old are you?",
            "What is your name?",
            "How are you?",
          ],
          translationDirection: "bs->en",
        },
        {
          id: "a1-u1-s2-l1-e3",
          type: "word_bank",
          prompt: "Sastavi rečenicu: 'My name is Amar'",
          promptEn: "Build the sentence: 'My name is Amar'",
          answer: "Zovem se Amar",
          choices: ["Zovem", "se", "Amar", "sam", "Ja"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s2-l1-e4",
          type: "match_pairs",
          prompt: "Spoji bosanske fraze s engleskim prijevodom.",
          promptEn: "Match the Bosnian phrases with their English translation.",
          pairs: [
            { bs: "Zovem se...", en: "My name is..." },
            { bs: "Drago mi je", en: "Nice to meet you" },
            { bs: "Odakle si?", en: "Where are you from?" },
            { bs: "Koliko imaš godina?", en: "How old are you?" },
          ],
        },
        {
          id: "a1-u1-s2-l1-e5",
          type: "listen_choose",
          prompt: "Poslušaj i odaberi tačan prijevod.",
          promptEn: "Listen and choose the correct translation.",
          targetPhrase: "Kako se zoveš?",
          answer: "What's your name?",
          choices: ["What's your name?", "How are you?", "Where are you from?", "Goodbye"],
        },
        {
          id: "a1-u1-s2-l1-e6",
          type: "speak",
          prompt: "Izgovori naglas.",
          promptEn: "Say it out loud.",
          targetPhrase: "Drago mi je",
        },
      ],
    },
  ],
};

// ── Skill 3: Brojevi 1-10 (Numbers 1-10) ────────────────────────────────────

const skill3: Skill = {
  id: "a1-u1-s3",
  order: 3,
  title: "Brojevi 1-10",
  titleEn: "Numbers 1-10",
  grammarTip:
    "Bosnian numbers change the case of the noun that follows: 'jedan' (one) agrees in gender with " +
    "the noun; 2-4 take the noun in genitive singular ('dva stola' - two tables); 5 and above take " +
    "the noun in genitive plural ('pet stolova' - five tables).",
  reviewStatus: "unreviewed",
  vocab: [
    { bs: "jedan", en: "one" },
    { bs: "dva", en: "two" },
    { bs: "tri", en: "three" },
    { bs: "četiri", en: "four" },
    { bs: "pet", en: "five" },
    { bs: "šest", en: "six" },
    { bs: "sedam", en: "seven" },
    { bs: "osam", en: "eight" },
    { bs: "devet", en: "nine" },
    { bs: "deset", en: "ten" },
  ],
  lessons: [
    {
      id: "a1-u1-s3-l1",
      order: 1,
      title: "Brojanje od 1 do 10",
      exercises: [
        {
          id: "a1-u1-s3-l1-e1",
          type: "multiple_choice",
          prompt: "Kako se kaže broj '7' na bosanskom?",
          promptEn: "How do you say the number '7' in Bosnian?",
          answer: "sedam",
          choices: ["sedam", "šest", "osam", "devet"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s3-l1-e2",
          type: "multiple_choice",
          prompt: "Šta znači 'četiri'?",
          promptEn: "What does 'četiri' mean?",
          answer: "four",
          choices: ["four", "three", "five", "six"],
          translationDirection: "bs->en",
        },
        {
          id: "a1-u1-s3-l1-e3",
          type: "word_bank",
          prompt: "Sastavi: 'I am five years old'",
          promptEn: "Build the phrase: 'I am five years old'",
          answer: "Imam pet godina",
          choices: ["Imam", "pet", "godina", "deset", "sam"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s3-l1-e4",
          type: "match_pairs",
          prompt: "Spoji brojeve s engleskim prijevodom.",
          promptEn: "Match the numbers with their English translation.",
          pairs: [
            { bs: "jedan", en: "one" },
            { bs: "tri", en: "three" },
            { bs: "šest", en: "six" },
            { bs: "deset", en: "ten" },
          ],
        },
        {
          id: "a1-u1-s3-l1-e5",
          type: "listen_choose",
          prompt: "Poslušaj i odaberi tačan prijevod.",
          promptEn: "Listen and choose the correct translation.",
          targetPhrase: "Osam",
          answer: "Eight",
          choices: ["Eight", "Two", "Nine", "Six"],
        },
        {
          id: "a1-u1-s3-l1-e6",
          type: "speak",
          prompt: "Izgovori naglas.",
          promptEn: "Say it out loud.",
          targetPhrase: "Devet",
        },
      ],
    },
  ],
};

// ── Skill 4: Boje (Colors) ───────────────────────────────────────────────────

const skill4: Skill = {
  id: "a1-u1-s4",
  order: 4,
  title: "Boje",
  titleEn: "Colors",
  grammarTip:
    "Bosnian adjectives — including colors — agree in gender with the noun they describe: 'crven " +
    "auto' (red car, masculine), 'crvena jabuka' (red apple, feminine), 'crveno cvijeće' (red " +
    "flowers, neuter). The dictionary form shown here is the masculine singular.",
  reviewStatus: "unreviewed",
  vocab: [
    { bs: "crven", en: "red" },
    { bs: "plav", en: "blue" },
    { bs: "zelen", en: "green" },
    { bs: "žut", en: "yellow" },
    { bs: "crn", en: "black" },
    { bs: "bijel", en: "white" },
    { bs: "narandžast", en: "orange" },
    { bs: "ljubičast", en: "purple" },
    { bs: "smeđ", en: "brown" },
    { bs: "ružičast", en: "pink" },
  ],
  lessons: [
    {
      id: "a1-u1-s4-l1",
      order: 1,
      title: "Osnovne boje",
      exercises: [
        {
          id: "a1-u1-s4-l1-e1",
          type: "multiple_choice",
          prompt: "Kako se kaže 'blue' na bosanskom?",
          promptEn: "How do you say 'blue' in Bosnian?",
          answer: "plav",
          choices: ["plav", "zelen", "žut", "crn"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s4-l1-e2",
          type: "multiple_choice",
          prompt: "Šta znači 'žut'?",
          promptEn: "What does 'žut' mean?",
          answer: "yellow",
          choices: ["yellow", "green", "orange", "purple"],
          translationDirection: "bs->en",
        },
        {
          id: "a1-u1-s4-l1-e3",
          type: "word_bank",
          prompt: "Sastavi: 'red and blue'",
          promptEn: "Build the phrase: 'red and blue'",
          answer: "crven i plav",
          choices: ["crven", "i", "plav", "žut", "crn"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s4-l1-e4",
          type: "match_pairs",
          prompt: "Spoji boje s engleskim prijevodom.",
          promptEn: "Match the colors with their English translation.",
          pairs: [
            { bs: "crven", en: "red" },
            { bs: "zelen", en: "green" },
            { bs: "crn", en: "black" },
            { bs: "bijel", en: "white" },
          ],
        },
        {
          id: "a1-u1-s4-l1-e5",
          type: "listen_choose",
          prompt: "Poslušaj i odaberi tačan prijevod.",
          promptEn: "Listen and choose the correct translation.",
          targetPhrase: "Narandžast",
          answer: "Orange",
          choices: ["Orange", "Purple", "Brown", "Pink"],
        },
        {
          id: "a1-u1-s4-l1-e6",
          type: "speak",
          prompt: "Izgovori naglas.",
          promptEn: "Say it out loud.",
          targetPhrase: "Ljubičast",
        },
      ],
    },
  ],
};

// ── Skill 5: Porodica (Family) ───────────────────────────────────────────────

const skill5: Skill = {
  id: "a1-u1-s5",
  order: 5,
  title: "Porodica",
  titleEn: "Family",
  grammarTip:
    "Possessive pronouns agree in gender with the noun they modify: 'moj brat' (my brother, " +
    "masculine), 'moja sestra' (my sister, feminine), 'moje dijete' (my child, neuter). " +
    "Third-person possessives change too: 'njegov brat' (his brother), 'njena sestra' (her sister).",
  reviewStatus: "unreviewed",
  vocab: [
    { bs: "majka", en: "mother" },
    { bs: "otac", en: "father" },
    { bs: "sestra", en: "sister" },
    { bs: "brat", en: "brother" },
    { bs: "baka", en: "grandmother" },
    { bs: "djed", en: "grandfather" },
    { bs: "sin", en: "son" },
    { bs: "kćerka", en: "daughter" },
    { bs: "muž", en: "husband" },
    { bs: "žena", en: "wife" },
    { bs: "dijete", en: "child" },
  ],
  lessons: [
    {
      id: "a1-u1-s5-l1",
      order: 1,
      title: "Moja porodica",
      exercises: [
        {
          id: "a1-u1-s5-l1-e1",
          type: "multiple_choice",
          prompt: "Kako se kaže 'mother' na bosanskom?",
          promptEn: "How do you say 'mother' in Bosnian?",
          answer: "majka",
          choices: ["majka", "otac", "sestra", "baka"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s5-l1-e2",
          type: "multiple_choice",
          prompt: "Šta znači 'brat'?",
          promptEn: "What does 'brat' mean?",
          answer: "brother",
          choices: ["brother", "father", "son", "husband"],
          translationDirection: "bs->en",
        },
        {
          id: "a1-u1-s5-l1-e3",
          type: "word_bank",
          prompt: "Sastavi: 'my sister'",
          promptEn: "Build the phrase: 'my sister'",
          answer: "moja sestra",
          choices: ["moja", "sestra", "moj", "brat", "otac"],
          translationDirection: "en->bs",
        },
        {
          id: "a1-u1-s5-l1-e4",
          type: "match_pairs",
          prompt: "Spoji članove porodice s engleskim prijevodom.",
          promptEn: "Match the family members with their English translation.",
          pairs: [
            { bs: "majka", en: "mother" },
            { bs: "otac", en: "father" },
            { bs: "sin", en: "son" },
            { bs: "kćerka", en: "daughter" },
          ],
        },
        {
          id: "a1-u1-s5-l1-e5",
          type: "listen_choose",
          prompt: "Poslušaj i odaberi tačan prijevod.",
          promptEn: "Listen and choose the correct translation.",
          targetPhrase: "Baka",
          answer: "Grandmother",
          choices: ["Grandmother", "Grandfather", "Mother", "Wife"],
        },
        {
          id: "a1-u1-s5-l1-e6",
          type: "speak",
          prompt: "Izgovori naglas.",
          promptEn: "Say it out loud.",
          targetPhrase: "Moja porodica",
        },
      ],
    },
  ],
};

const skills = [skill1, skill2, skill3, skill4, skill5];

const blueprint: Blueprint = {
  language: "bs",
  levels: ["A1"],
  units: [
    {
      id: "a1-u1",
      level: "A1",
      order: 1,
      title: "Osnove",
      titleEn: "Basics",
      theme:
        "Everyday greetings, self-introduction, numbers, colors, and family vocabulary for " +
        "absolute beginners.",
      skills: skills.map((s) => ({
        id: s.id,
        order: s.order,
        title: s.title,
        titleEn: s.titleEn,
        grammarFocus: s.grammarTip.split(".")[0] + ".",
        targetVocabCount: s.vocab.length,
      })),
    },
  ],
};

async function main() {
  await mkdir(GENERATED_DIR, { recursive: true });
  await mkdir(SKILLS_DIR, { recursive: true });

  const validatedBlueprint = BlueprintSchema.parse(blueprint);
  await writeFile(BLUEPRINT_PATH, `${JSON.stringify(validatedBlueprint, null, 2)}\n`, "utf-8");

  for (const skill of skills) {
    const validated = SkillSchema.parse(skill);
    await writeFile(skillFilePath(skill.id), `${JSON.stringify(validated, null, 2)}\n`, "utf-8");
  }

  const unit = UnitSchema.parse({
    id: "a1-u1",
    level: "A1",
    order: 1,
    title: "Osnove",
    titleEn: "Basics",
    theme: blueprint.units[0]!.theme,
    skills: skills.map((s) => SkillSchema.parse(s)),
  });
  const course: Course = CourseSchema.parse({ language: "bs", units: [unit] });
  await writeFile(COURSE_PATH, `${JSON.stringify(course, null, 2)}\n`, "utf-8");

  console.log(
    `Seeded hand-authored A1 content: 1 unit, ${skills.length} skills, ` +
      `${skills.reduce((n, s) => n + s.vocab.length, 0)} vocab items, ` +
      `${skills.reduce((n, s) => n + s.lessons.reduce((m, l) => m + l.exercises.length, 0), 0)} exercises.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
