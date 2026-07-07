import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  real,
} from "drizzle-orm/pg-core";

export type ExerciseType =
  | "multiple_choice"
  | "word_bank"
  | "match_pairs"
  | "listen_choose"
  | "speak";

export type ReviewStatus = "unreviewed" | "reviewed";

/** Payload stored on each exercise (shape mirrors the content-JSON contract). */
export interface ExercisePayload {
  prompt: string;
  promptEn?: string;
  answer?: string;
  choices?: string[];
  pairs?: { bs: string; en: string }[];
  targetPhrase?: string;
  audioUrl?: string;
  translationDirection?: "bs->en" | "en->bs";
}

export interface PerWordScore {
  target: string;
  matched: boolean;
  similarity: number;
  heard?: string;
}

// ── Content ────────────────────────────────────────────────────────────
export const courses = pgTable("courses", {
  id: text("id").primaryKey(),
  language: text("language").notNull(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const units = pgTable("units", {
  id: text("id").primaryKey(),
  courseId: text("course_id")
    .notNull()
    .references(() => courses.id),
  level: text("level").notNull(),
  orderIndex: integer("order_index").notNull(),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull(),
  theme: text("theme"),
});

export const skills = pgTable("skills", {
  id: text("id").primaryKey(),
  unitId: text("unit_id")
    .notNull()
    .references(() => units.id),
  orderIndex: integer("order_index").notNull(),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull(),
  grammarTip: text("grammar_tip"),
  reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("unreviewed"),
});

export const lessons = pgTable("lessons", {
  id: text("id").primaryKey(),
  skillId: text("skill_id")
    .notNull()
    .references(() => skills.id),
  orderIndex: integer("order_index").notNull(),
  title: text("title").notNull(),
});

export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id),
  orderIndex: integer("order_index").notNull(),
  type: text("type").$type<ExerciseType>().notNull(),
  payload: jsonb("payload").$type<ExercisePayload>().notNull(),
  reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("unreviewed"),
});

// ── Users & auth ───────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: text("id").primaryKey(), // == jwt jti
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked: boolean("revoked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Progress ───────────────────────────────────────────────────────────
export const userStats = pgTable("user_stats", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  hearts: integer("hearts").notNull().default(5),
  heartsUpdatedAt: timestamp("hearts_updated_at", { withTimezone: true }).defaultNow(),
  lastActive: timestamp("last_active", { withTimezone: true }),
});

export const userSkillProgress = pgTable(
  "user_skill_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id),
    crownLevel: integer("crown_level").notNull().default(0),
    unlocked: boolean("unlocked").notNull().default(false),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.skillId] }) }),
);

export const lessonAttempts = pgTable("lesson_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  lessonId: text("lesson_id")
    .notNull()
    .references(() => lessons.id),
  correctCount: integer("correct_count").notNull(),
  total: integer("total").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow(),
});

// ── AI features ────────────────────────────────────────────────────────
export const pronunciationAttempts = pgTable("pronunciation_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  exerciseId: text("exercise_id"),
  targetPhrase: text("target_phrase").notNull(),
  transcript: text("transcript").notNull(),
  score: integer("score").notNull(),
  perWord: jsonb("per_word").$type<PerWordScore[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const tutorSessions = pgTable("tutor_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  roomName: text("room_name").notNull(),
  // CEFR level ("A1"/"A2"/"B1"/"B2") requested for this session, mirrored onto
  // the LiveKit room metadata that voice-agent/agent.py reads. Nullable: older
  // rows and sessions that didn't specify a level have none.
  level: text("level"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSec: real("duration_sec"),
});

export const tutorTurns = pgTable("tutor_turns", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => tutorSessions.id),
  role: text("role").$type<"tutor" | "learner">().notNull(),
  textBs: text("text_bs").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
