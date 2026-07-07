import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { pronunciationAttempts } from "../db/schema.js";
import { HttpError, requireAuth, userIdOf } from "../http.js";
import { scorePronunciation, type WordScore } from "../services/scoring.js";

export interface ProcessPronunciationInput {
  userId: string;
  targetPhrase: string;
  exerciseId?: string;
  audio: Buffer;
  filename: string;
}

export interface ProcessPronunciationOutput {
  score: number;
  perWord: WordScore[];
  transcript: string;
}

/**
 * Core pronunciation-grading logic, factored out of the multipart route so it is
 * directly unit-testable: transcribe -> score -> persist. Reused by
 * `POST /api/pronunciation`.
 */
export async function processPronunciation(
  deps: AppDeps,
  input: ProcessPronunciationInput,
): Promise<ProcessPronunciationOutput> {
  const { db, transcriber } = deps;
  const { userId, targetPhrase, exerciseId, audio, filename } = input;

  const rawTranscript = await transcriber.transcribe(audio, filename);
  const result = scorePronunciation(targetPhrase, rawTranscript);

  // Hook for a future enhancement: an optional short natural-language tip
  // (e.g. "your č sounded like c") could be generated here via an LLM call fed
  // `result` + `rawTranscript`, then attached to the response/persisted row.
  // Left out of the MVP so scoring stays useful/cheap without an extra LLM
  // round-trip; wire in a `tipGenerator` dependency on AppDeps when ready.

  await db.insert(pronunciationAttempts).values({
    id: randomUUID(),
    userId,
    exerciseId: exerciseId ?? null,
    targetPhrase,
    transcript: result.transcript,
    score: result.score,
    perWord: result.perWord,
  });

  return { score: result.score, perWord: result.perWord, transcript: result.transcript };
}

const fieldsSchema = z.object({
  targetPhrase: z.string().min(1),
  exerciseId: z.string().min(1).optional(),
});

export function pronunciationRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.post("/api/pronunciation", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);

    let targetPhrase: string | undefined;
    let exerciseId: string | undefined;
    let audio: Buffer | undefined;
    let filename = "audio.webm";

    for await (const part of request.parts()) {
      if (part.type === "file" && part.fieldname === "audio") {
        audio = await part.toBuffer();
        filename = part.filename || filename;
      } else if (part.type === "field" && part.fieldname === "targetPhrase") {
        targetPhrase = String(part.value);
      } else if (part.type === "field" && part.fieldname === "exerciseId") {
        exerciseId = String(part.value);
      }
    }

    if (!audio) throw new HttpError(400, "Missing audio file");
    const parsed = fieldsSchema.parse({ targetPhrase, exerciseId });

    return processPronunciation(deps, {
      userId,
      targetPhrase: parsed.targetPhrase,
      exerciseId: parsed.exerciseId,
      audio,
      filename,
    });
  });
}
