import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { tutorSessions } from "../db/schema.js";
import { requireAuth, userIdOf } from "../http.js";

const bodySchema = z.object({
  level: z.string().min(1).optional(),
});

/**
 * `POST /api/tutor/session` — mints a short-lived LiveKit room token so the app
 * can join the real-time voice-tutor room, and records the session. The actual
 * voice loop (VAD -> Bosnian STT -> LLM -> bs-BA TTS) runs in `/voice-agent`,
 * not over HTTP.
 */
export function tutorRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, minter } = deps;

  app.post("/api/tutor/session", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);
    bodySchema.parse(request.body ?? {});

    const roomName = `tutor-${userId}-${randomUUID().slice(0, 8)}`;
    const grant = await minter.mint(userId, roomName);

    await db.insert(tutorSessions).values({
      id: randomUUID(),
      userId,
      roomName,
    });

    return { roomName: grant.roomName, token: grant.token, url: grant.url };
  });
}
