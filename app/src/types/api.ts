/**
 * Shared types for the Ljiljan backend API contract.
 * Mirrors the actual Fastify route responses in `/backend/src/routes/*` and
 * the Drizzle row shapes in `/backend/src/db/schema.ts` — kept in sync by
 * hand since the app doesn't share a package boundary with the backend.
 */

// ── Auth ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface MeResponse {
  user: User;
}

// ── Content: courses → units → skills → lessons ────────────────────────
// Wire shapes for `GET /api/courses` (see backend/src/routes/courses.ts).

export interface LessonSummary {
  id: string;
  title: string;
  orderIndex: number;
}

export type ReviewStatus = 'unreviewed' | 'reviewed';

export interface SkillSummary {
  id: string;
  title: string;
  titleEn: string;
  grammarTip: string | null;
  orderIndex: number;
  reviewStatus: ReviewStatus;
  unlocked: boolean;
  crownLevel: number;
  lessons: LessonSummary[];
}

export interface UnitSummary {
  id: string;
  level: string;
  title: string;
  titleEn: string;
  theme: string | null;
  orderIndex: number;
  skills: SkillSummary[];
}

export interface Course {
  id: string;
  language: string;
  title: string;
  units: UnitSummary[];
}

export interface CoursesResponse {
  courses: Course[];
}

// ── Lessons & exercises ──────────────────────────────────────────────────
// `GET /api/lessons/:id` returns `{ lesson, exercises }`, not a merged object.

export type ExerciseType =
  | 'multiple_choice'
  | 'word_bank'
  | 'match_pairs'
  | 'listen_choose'
  | 'speak';

export type TranslationDirection = 'bs->en' | 'en->bs';

export interface ExercisePair {
  bs: string;
  en: string;
}

/** The JSON payload stored per-exercise (`exercises.payload` column). */
export interface ExercisePayload {
  prompt: string;
  promptEn?: string;
  answer?: string;
  choices?: string[];
  pairs?: ExercisePair[];
  targetPhrase?: string;
  /** May be a real `https://` URL or a `PLACEHOLDER://…` sentinel when no
   * Azure TTS key is configured server-side — treat as non-playable. */
  audioUrl?: string;
  translationDirection?: TranslationDirection;
}

export interface Exercise {
  id: string;
  lessonId: string;
  orderIndex: number;
  type: ExerciseType;
  payload: ExercisePayload;
  reviewStatus: ReviewStatus;
}

export interface LessonMeta {
  id: string;
  title: string;
  skillId: string;
  orderIndex: number;
}

export interface LessonResponse {
  lesson: LessonMeta;
  exercises: Exercise[];
}

// ── Progress ────────────────────────────────────────────────────────────
// Raw `user_stats` / `user_skill_progress` row shapes.

export interface UserStats {
  userId: string;
  xp: number;
  streak: number;
  hearts: number;
  heartsUpdatedAt: string | null;
  lastActive: string | null;
}

export interface SkillProgress {
  userId: string;
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
