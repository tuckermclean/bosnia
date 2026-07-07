import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import type { AppDeps } from "./deps.js";
import { HttpError } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { courseRoutes } from "./routes/courses.js";
import { progressRoutes } from "./routes/progress.js";
import { pronunciationRoutes } from "./routes/pronunciation.js";
import { tutorRoutes } from "./routes/tutor.js";

/** Max upload size for pronunciation audio clips (see routes/pronunciation.ts). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Builds the Fastify app with injected deps so tests can supply fakes. */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });
  app.register(helmet);
  app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: error.message });
      return;
    }
    if (error instanceof ZodError) {
      reply.status(400).send({ error: "Validation error", issues: error.issues });
      return;
    }
    app.log.error(error);
    reply.status(500).send({ error: "Internal server error" });
  });

  app.get("/health", async () => ({ ok: true }));

  authRoutes(app, deps);
  courseRoutes(app, deps);
  progressRoutes(app, deps);
  pronunciationRoutes(app, deps);
  tutorRoutes(app, deps);

  return app;
}
