import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "./services/auth.js";

/** Thrown by route handlers to produce a clean JSON error response. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * preHandler that requires a valid Bearer access token and stashes the user id
 * on the request. Handlers read it via `userIdOf(request)`.
 */
export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing bearer token");
  }
  try {
    const claims = verifyAccessToken(header.slice("Bearer ".length));
    (request as FastifyRequest & { userId?: string }).userId = claims.sub;
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
}

export function userIdOf(request: FastifyRequest): string {
  const id = (request as FastifyRequest & { userId?: string }).userId;
  if (!id) throw new HttpError(401, "Not authenticated");
  return id;
}
