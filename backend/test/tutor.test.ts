import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { tutorSessions } from "../src/db/schema.js";
import { fakeTranscriber, fakeMinter } from "./helpers.js";

describe("tutor session", () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeEach(async () => {
    dbHandle = await createTestDb();
    app = buildApp({
      db: dbHandle.db,
      transcriber: fakeTranscriber(""),
      minter: fakeMinter({ token: "fixed-token", url: "wss://example.livekit.cloud" }),
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await dbHandle.close();
  });

  it("mints a room token and records a tutor session", async () => {
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "t@example.com", password: "password1" },
    });
    const { accessToken } = register.json();

    const res = await app.inject({
      method: "POST",
      url: "/api/tutor/session",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBe("fixed-token");
    expect(body.url).toBe("wss://example.livekit.cloud");
    expect(body.roomName).toMatch(/^tutor-/);

    const rows = await dbHandle.db.select().from(tutorSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.roomName).toBe(body.roomName);
  });

  it("rejects tutor session requests without auth", async () => {
    const res = await app.inject({ method: "POST", url: "/api/tutor/session", payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
