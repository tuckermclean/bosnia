/**
 * Zod schemas for the curriculum pipeline.
 *
 * Two families of schema live here:
 *  - Blueprint schema: the CEFR skeleton (ordered units/skills, no lesson content yet).
 *  - Course schema: the FIXED canonical course JSON contract the backend ingests.
 *    Do not change field names/shape without updating the backend ingester in lockstep.
 */
import { z } from "zod";

// ── Shared enums ────────────────────────────────────────────────────────────

export const CEFRLevelSchema = z.enum(["A1", "A2", "B1", "B2"]);
export type CEFRLevel = z.infer<typeof CEFRLevelSchema>;

export const ReviewStatusSchema = z.enum(["unreviewed", "reviewed"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const TranslationDirectionSchema = z.enum(["bs->en", "en->bs"]);
export type TranslationDirection = z.infer<typeof TranslationDirectionSchema>;

export const ExerciseTypeSchema = z.enum([
  "multiple_choice",
  "word_bank",
  "match_pairs",
  "listen_choose",
  "speak",
]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

// ── Blueprint (CEFR skeleton) ────────────────────────────────────────────────

export const SkillBlueprintSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  titleEn: z.string().min(1),
  grammarFocus: z.string().min(1),
  targetVocabCount: z.number().int().positive(),
});
export type SkillBlueprint = z.infer<typeof SkillBlueprintSchema>;

export const UnitBlueprintSchema = z.object({
  id: z.string().min(1),
  level: CEFRLevelSchema,
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  titleEn: z.string().min(1),
  theme: z.string().min(1),
  skills: z.array(SkillBlueprintSchema).min(1),
});
export type UnitBlueprint = z.infer<typeof UnitBlueprintSchema>;

export const BlueprintSchema = z.object({
  language: z.literal("bs"),
  levels: z.array(CEFRLevelSchema).min(1),
  units: z.array(UnitBlueprintSchema).min(1),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

// ── Course content (FIXED contract) ─────────────────────────────────────────

export const VocabItemSchema = z.object({
  bs: z.string().min(1),
  en: z.string().min(1),
  audioHash: z.string().min(1).optional(),
});
export type VocabItem = z.infer<typeof VocabItemSchema>;

export const PairSchema = z.object({
  bs: z.string().min(1),
  en: z.string().min(1),
});
export type Pair = z.infer<typeof PairSchema>;

const exerciseCommon = {
  id: z.string().min(1),
  prompt: z.string().min(1),
  promptEn: z.string().min(1).optional(),
  translationDirection: TranslationDirectionSchema.optional(),
};

export const MultipleChoiceExerciseSchema = z.object({
  ...exerciseCommon,
  type: z.literal("multiple_choice"),
  answer: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
});
export type MultipleChoiceExercise = z.infer<typeof MultipleChoiceExerciseSchema>;

export const WordBankExerciseSchema = z.object({
  ...exerciseCommon,
  type: z.literal("word_bank"),
  answer: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
});
export type WordBankExercise = z.infer<typeof WordBankExerciseSchema>;

export const MatchPairsExerciseSchema = z.object({
  ...exerciseCommon,
  type: z.literal("match_pairs"),
  pairs: z.array(PairSchema).min(2),
});
export type MatchPairsExercise = z.infer<typeof MatchPairsExerciseSchema>;

export const ListenChooseExerciseSchema = z.object({
  ...exerciseCommon,
  type: z.literal("listen_choose"),
  answer: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  targetPhrase: z.string().min(1),
  audioHash: z.string().min(1).optional(),
});
export type ListenChooseExercise = z.infer<typeof ListenChooseExerciseSchema>;

export const SpeakExerciseSchema = z.object({
  ...exerciseCommon,
  type: z.literal("speak"),
  targetPhrase: z.string().min(1),
  audioHash: z.string().min(1).optional(),
});
export type SpeakExercise = z.infer<typeof SpeakExerciseSchema>;

export const ExerciseSchema = z.discriminatedUnion("type", [
  MultipleChoiceExerciseSchema,
  WordBankExerciseSchema,
  MatchPairsExerciseSchema,
  ListenChooseExerciseSchema,
  SpeakExerciseSchema,
]);
export type Exercise = z.infer<typeof ExerciseSchema>;

export const LessonSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  exercises: z.array(ExerciseSchema).min(1),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const SkillSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  titleEn: z.string().min(1),
  grammarTip: z.string().min(1),
  reviewStatus: ReviewStatusSchema,
  vocab: z.array(VocabItemSchema).min(1),
  lessons: z.array(LessonSchema).min(1),
});
export type Skill = z.infer<typeof SkillSchema>;

export const UnitSchema = z.object({
  id: z.string().min(1),
  level: CEFRLevelSchema,
  order: z.number().int().nonnegative(),
  title: z.string().min(1),
  titleEn: z.string().min(1),
  theme: z.string().min(1),
  skills: z.array(SkillSchema).min(1),
});
export type Unit = z.infer<typeof UnitSchema>;

export const CourseSchema = z.object({
  language: z.literal("bs"),
  units: z.array(UnitSchema).min(1),
});
export type Course = z.infer<typeof CourseSchema>;

// ── Audio manifest ───────────────────────────────────────────────────────────

export const AudioManifestEntrySchema = z.object({
  url: z.string().min(1),
  text: z.string().min(1),
  voice: z.string().min(1),
});
export type AudioManifestEntry = z.infer<typeof AudioManifestEntrySchema>;

export const AudioManifestSchema = z.record(z.string(), AudioManifestEntrySchema);
export type AudioManifest = z.infer<typeof AudioManifestSchema>;
