import Fastify, { LogController, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import type { AppDeps } from "./deps.js";
import { HttpError } from "./http.js";
import { FeatureUnavailableError } from "./unavailable.js";
import { authRoutes } from "./routes/auth.js";
import { courseRoutes } from "./routes/courses.js";
import { progressRoutes } from "./routes/progress.js";
import { pronunciationRoutes } from "./routes/pronunciation.js";
import { tutorRoutes } from "./routes/tutor.js";

/** Max upload size for pronunciation audio clips (see routes/pronunciation.ts). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The server process's logger options: level info, request lines off (see buildApp). */
export const SERVER_LOGGER = { level: "info" };

export interface BuildAppOptions {
  logger?: boolean | { level: string };
}

/** Builds the Fastify app with injected deps so tests can supply fakes. */
export function buildApp(deps: AppDeps, options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false, logController: new LogController({ disableRequestLogging: true }) });

  app.register(cors, { origin: true });
  app.register(helmet);
  app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      reply.status(error.statusCode).send({ error: error.message });
      return;
    }
    if (error instanceof FeatureUnavailableError) {
      request.log.error(`${error.feature} is unavailable: ${error.missingKeys.join(", ")} not set`);
      reply.status(503).send({ error: error.message });
      return;
    }
    if (error instanceof ZodError) {
      reply.status(400).send({ error: "Validation error", issues: error.issues });
      return;
    }
    request.log.error(error);
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
