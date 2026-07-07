import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { refreshTokens, users, userStats } from "../db/schema.js";
import { HttpError, requireAuth, userIdOf } from "../http.js";
import {
  hashPassword,
  issueRefreshToken,
  sha256,
  signAccessToken,
  verifyPassword,
  verifyRefreshToken,
} from "../services/auth.js";

const credentials = z.object({
  email: z.string().email(),
  // Upper bound guards against Argon2-cost DoS from pathologically long inputs.
  password: z.string().min(8).max(256),
});

// A valid Argon2 hash computed once at module load, verified against on login
// attempts for emails that don't exist — so failing on an unknown email costs
// the same wall-clock time as failing on a wrong password, and login timing
// can't be used to enumerate registered addresses.
const DUMMY_PASSWORD_HASH = hashPassword("dummy-password-for-constant-time-login-checks");

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  async function issueTokens(userId: string) {
    const accessToken = signAccessToken(userId);
    const refresh = issueRefreshToken(userId);
    await db.insert(refreshTokens).values({
      id: refresh.jti,
      userId,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    });
    return { accessToken, refreshToken: refresh.token };
  }

  app.post("/api/auth/register", async (request) => {
    const { email, password } = credentials.parse(request.body);
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) throw new HttpError(409, "Email already registered");

    const id = randomUUID();
    await db.insert(users).values({ id, email, passwordHash: await hashPassword(password) });
    await db.insert(userStats).values({ userId: id });

    const tokens = await issueTokens(id);
    return { user: { id, email }, ...tokens };
  });

  app.post("/api/auth/login", async (request) => {
    const { email, password } = credentials.parse(request.body);
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user) {
      // Burn the same Argon2-verify time an existing user's wrong password
      // would cost, so response timing doesn't leak whether `email` is registered.
      await verifyPassword(await DUMMY_PASSWORD_HASH, password);
      throw new HttpError(401, "Invalid email or password");
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new HttpError(401, "Invalid email or password");
    }
    const tokens = await issueTokens(user.id);
    return { user: { id: user.id, email: user.email }, ...tokens };
  });

  app.post("/api/auth/refresh", async (request) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body);
    let claims;
    try {
      claims = verifyRefreshToken(refreshToken);
    } catch {
      throw new HttpError(401, "Invalid refresh token");
    }
    const rows = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, claims.jti))
      .limit(1);
    const stored = rows[0];
    if (
      !stored ||
      stored.revoked ||
      stored.tokenHash !== sha256(refreshToken) ||
      stored.expiresAt.getTime() < Date.now()
    ) {
      throw new HttpError(401, "Refresh token not recognized");
    }
    // Rotate: revoke the used token, issue a fresh pair.
    await db.update(refreshTokens).set({ revoked: true }).where(eq(refreshTokens.id, claims.jti));
    return issueTokens(claims.sub);
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    const userId = userIdOf(request);
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = rows[0];
    if (!user) throw new HttpError(404, "User not found");
    return { user: { id: user.id, email: user.email } };
  });
}
