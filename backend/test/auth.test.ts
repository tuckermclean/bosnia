import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { fakeTranscriber, fakeMinter } from "./helpers.js";

describe("auth flow", () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeEach(async () => {
    dbHandle = await createTestDb();
    app = buildApp({ db: dbHandle.db, transcriber: fakeTranscriber(""), minter: fakeMinter() });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await dbHandle.close();
  });

  it("registers, logs in, rotates refresh tokens, and fetches /me", async () => {
    const email = "learner@example.com";
    const password = "hunter2222";

    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password },
    });
    expect(register.statusCode).toBe(200);
    expect(register.json().user.email).toBe(email);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken, refreshToken } = login.json();
    expect(typeof accessToken).toBe("string");
    expect(typeof refreshToken).toBe("string");

    const refresh = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    const rotated = refresh.json();
    expect(rotated.refreshToken).not.toBe(refreshToken);

    // Reusing the now-revoked refresh token must fail (rotation invariant).
    const reuse = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      payload: { refreshToken },
    });
    expect(reuse.statusCode).toBe(401);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${rotated.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);
  });

  it("rejects /me without a bearer token", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });
});
