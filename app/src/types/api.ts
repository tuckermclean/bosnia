/**
 * Shared types for the Ljiljan backend API contract.
 * Mirrors `/api` request & response shapes documented in the build plan.
 */

// ── Auth ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ── Content: courses → units → skills → lessons ────────────────────────

export interface SkillSummary {
  id: string;
  name: string;
  description?: string;
  order: number;
  crownLevel: number;
  maxCrownLevel: number;
  unlocked: boolean;
  lessonIds: string[];
}

export interface UnitSummary {
  id: string;
  title: string;
  description?: string;
  order: number;
  cefrLevel: 'A1' | 'A2' | 'B1' | 'B2';
  skills: SkillSummary[];
}

export interface Course {
  id: string;
  title: string;
  units: UnitSummary[];
}

export type ExerciseType =
  | 'multiple_choice'
  | 'word_bank'
  | 'match_pairs'
  | 'listen_choose'
  | 'speak';

export type TranslationDirection = 'bs_to_en' | 'en_to_bs';

export interface ExercisePair {
  bs: string;
  en: string;
}

export interface Exercise {
  id: string;
  type: ExerciseType;
  prompt: string;
  promptEn?: string;
  answer?: string;
  choices?: string[];
  pairs?: ExercisePair[];
  targetPhrase?: string;
  audioUrl?: string;
  translationDirection?: TranslationDirection;
}

export interface Lesson {
  id: string;
  skillId: string;
  title: string;
  exercises: Exercise[];
}

// ── Progress ────────────────────────────────────────────────────────────

export interface UserStats {
  xp: number;
  streak: number;
  hearts: number;
  maxHearts: number;
  lastActive?: string;
  lessonsCompleted: number;
}

export interface SkillProgress {
  skillId: string;
  crownLevel: number;
  unlocked: boolean;
}

export interface ProgressResponse {
  stats: UserStats;
  skillProgress: SkillProgress[];
}

export interface LessonCompleteRequest {
  lessonId: string;
  correctCount: number;
  total: number;
}

export interface LessonCompleteResponse {
  stats: UserStats;
  unlockedSkillIds: string[];
}

// ── Pronunciation ───────────────────────────────────────────────────────

export interface PerWordScore {
  target: string;
  matched: boolean;
  similarity: number;
  heard?: string;
}

export interface PronunciationResult {
  score: number;
  perWord: PerWordScore[];
  transcript: string;
  feedback?: string;
}

// ── Voice tutor ─────────────────────────────────────────────────────────

export interface TutorSessionResponse {
  roomName: string;
  token: string;
  url: string;
}

export interface TutorSessionRequest {
  level?: string;
}
