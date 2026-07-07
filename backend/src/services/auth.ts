import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import { createHash, randomUUID } from "node:crypto";
import { env } from "../env.js";

const ACCESS_TTL = "15m";
const REFRESH_TTL_DAYS = 30;

export interface AccessClaims {
  sub: string;
  type: "access";
}
export interface RefreshClaims {
  sub: string;
  type: "refresh";
  jti: string;
}

export function hashPassword(password: string): Promise<string> {
  return argonHash(password);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argonVerify(hash, password);
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

export interface IssuedRefresh {
  token: string;
  jti: string;
  tokenHash: string;
  expiresAt: Date;
}

export function issueRefreshToken(userId: string): IssuedRefresh {
  const jti = randomUUID();
  const token = jwt.sign({ sub: userId, type: "refresh", jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
  });
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, jti, tokenHash: sha256(token), expiresAt };
}

export function verifyAccessToken(token: string): AccessClaims {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] }) as AccessClaims;
  if (decoded.type !== "access") throw new Error("wrong token type");
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshClaims {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] }) as RefreshClaims;
  if (decoded.type !== "refresh") throw new Error("wrong token type");
  return decoded;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
