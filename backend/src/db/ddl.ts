/**
 * Schema DDL kept in sync with `schema.ts`. Used to initialize PGlite (local dev
 * and tests) and to bootstrap a fresh Postgres. All statements are IF NOT EXISTS
 * so it is safe to run repeatedly.
 */
export const SCHEMA_DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY,
  language text NOT NULL,
  title text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id text PRIMARY KEY,
  course_id text NOT NULL REFERENCES courses(id),
  level text NOT NULL,
  order_index integer NOT NULL,
  title text NOT NULL,
  title_en text NOT NULL,
  theme text
);

CREATE TABLE IF NOT EXISTS skills (
  id text PRIMARY KEY,
  unit_id text NOT NULL REFERENCES units(id),
  order_index integer NOT NULL,
  title text NOT NULL,
  title_en text NOT NULL,
  grammar_tip text,
  review_status text NOT NULL DEFAULT 'unreviewed'
);

CREATE TABLE IF NOT EXISTS lessons (
  id text PRIMARY KEY,
  skill_id text NOT NULL REFERENCES skills(id),
  order_index integer NOT NULL,
  title text NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id text PRIMARY KEY,
  lesson_id text NOT NULL REFERENCES lessons(id),
  order_index integer NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'unreviewed'
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id text PRIMARY KEY REFERENCES users(id),
  xp integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  hearts integer NOT NULL DEFAULT 5,
  hearts_updated_at timestamptz DEFAULT now(),
  last_active timestamptz
);

CREATE TABLE IF NOT EXISTS user_skill_progress (
  user_id text NOT NULL REFERENCES users(id),
  skill_id text NOT NULL REFERENCES skills(id),
  crown_level integer NOT NULL DEFAULT 0,
  unlocked boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS lesson_attempts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  lesson_id text NOT NULL REFERENCES lessons(id),
  correct_count integer NOT NULL,
  total integer NOT NULL,
  completed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pronunciation_attempts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  exercise_id text,
  target_phrase text NOT NULL,
  transcript text NOT NULL,
  score integer NOT NULL,
  per_word jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tutor_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  room_name text NOT NULL,
  level text,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  duration_sec real
);

CREATE TABLE IF NOT EXISTS tutor_turns (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES tutor_sessions(id),
  role text NOT NULL,
  text_bs text NOT NULL,
  created_at timestamptz DEFAULT now()
);
`;
