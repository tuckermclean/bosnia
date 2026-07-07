import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { tutorSessions } from "../db/schema.js";
import { requireAuth, userIdOf } from "../http.js";

const bodySchema = z.object({
  level: z.enum(["A1", "A2", "B1", "B2"]).optional(),
  scenario: z.string().min(1).optional(),
});

/**
 * `POST /api/tutor/session` — mints a short-lived LiveKit room token so the app
 * can join the real-time voice-tutor room, and records the session. The actual
 * voice loop (VAD -> Bosnian STT -> LLM -> bs-BA TTS) runs in `/voice-agent`,
 * not over HTTP.
 *
 * The learner's CEFR `level` (and optional role-play `scenario`) are set as
 * JSON LiveKit room metadata — `{"level":"A2","scenario":"cafe"}` — which is
 * exactly what voice-agent/agent.py's `_session_metadata()` reads via
 * `ctx.room.metadata` to pick the tutor's difficulty and prompt. Without this,
 * the agent silently falls back to its configured default level.
 */
export function tutorRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, minter } = deps;

  app.post("/api/tutor/session", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);
    const { level, scenario } = bodySchema.parse(request.body ?? {});

    const roomName = `tutor-${userId}-${randomUUID().slice(0, 8)}`;
    const grant = await minter.mint(userId, roomName, { level, scenario });

    const sessionId = randomUUID();
    await db.insert(tutorSessions).values({
      id: sessionId,
      userId,
      roomName,
      level: level ?? null,
    });

    return { sessionId, roomName: grant.roomName, token: grant.token, url: grant.url };
  });
}
