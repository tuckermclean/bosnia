import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { tutorSessions } from "../src/db/schema.js";
import { fakeTranscriber, fakeMinter, type FakeMinterCall } from "./helpers.js";

describe("tutor session", () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let minterCalls: FakeMinterCall[];

  beforeEach(async () => {
    dbHandle = await createTestDb();
    const minter = fakeMinter({ token: "fixed-token", url: "wss://example.livekit.cloud" });
    minterCalls = minter.calls;
    app = buildApp({
      db: dbHandle.db,
      transcriber: fakeTranscriber(""),
      minter,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await dbHandle.close();
  });

  async function registerUser() {
    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "t@example.com", password: "password1" },
    });
    return register.json().accessToken as string;
  }

  it("mints a room token, returns a sessionId, and records a tutor session", async () => {
    const accessToken = await registerUser();

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
    expect(typeof body.sessionId).toBe("string");
    expect(body.sessionId.length).toBeGreaterThan(0);

    const rows = await dbHandle.db.select().from(tutorSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(body.sessionId);
    expect(rows[0]?.roomName).toBe(body.roomName);
    expect(rows[0]?.level).toBeNull();
  });

  it("rejects tutor session requests without auth", async () => {
    const res = await app.inject({ method: "POST", url: "/api/tutor/session", payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it("forwards {level, scenario} to the LiveKit minter as room metadata, and persists level", async () => {
    const accessToken = await registerUser();

    const res = await app.inject({
      method: "POST",
      url: "/api/tutor/session",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { level: "A2", scenario: "cafe" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // This is exactly the shape voice-agent/agent.py's `_session_metadata()`
    // expects on `ctx.room.metadata`: {"level": "...", "scenario": "..."}.
    expect(minterCalls).toHaveLength(1);
    expect(minterCalls[0]?.metadata).toEqual({ level: "A2", scenario: "cafe" });

    const rows = await dbHandle.db.select().from(tutorSessions);
    expect(rows[0]?.level).toBe("A2");
  });

  it("rejects an invalid CEFR level", async () => {
    const accessToken = await registerUser();

    const res = await app.inject({
      method: "POST",
      url: "/api/tutor/session",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { level: "not-a-level" },
    });
    expect(res.statusCode).toBe(400);
  });
});
