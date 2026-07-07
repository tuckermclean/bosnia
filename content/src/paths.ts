import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of the `content` package (one level up from `src/`). */
export const CONTENT_ROOT = path.resolve(__dirname, "..");

/**
 * Base directory for generated/audio/review-export data. Defaults to the
 * package root, but can be redirected via CONTENT_DATA_ROOT so tests can
 * point the whole pipeline at an isolated temp directory instead of the
 * real committed content. Read once at import time, so tests that need a
 * different root must set the env var before importing this module (or any
 * module that imports it) — e.g. via `vi.resetModules()` + dynamic import.
 */
const DATA_ROOT = process.env.CONTENT_DATA_ROOT
  ? path.resolve(process.env.CONTENT_DATA_ROOT)
  : CONTENT_ROOT;

export const GENERATED_DIR = path.join(DATA_ROOT, "generated");
export const SKILLS_DIR = path.join(GENERATED_DIR, "skills");
export const BLUEPRINT_PATH = path.join(GENERATED_DIR, "blueprint.json");
export const COURSE_PATH = path.join(GENERATED_DIR, "course.json");

export const AUDIO_DIR = path.join(DATA_ROOT, "audio-out");
export const AUDIO_MANIFEST_PATH = path.join(AUDIO_DIR, "manifest.json");

export const REVIEW_EXPORT_DIR = path.join(DATA_ROOT, "review-export");

export function skillFilePath(skillId: string): string {
  return path.join(SKILLS_DIR, `${skillId}.json`);
}
