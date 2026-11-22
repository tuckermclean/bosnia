import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import FormData from "form-data";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { pronunciationAttempts, userStats, users } from "../src/db/schema.js";
import type { Transcriber } from "../src/services/groq.js";
import { fakeMinter } from "./helpers.js";

/** A transcriber fake that counts its calls and, when given, throws `error`. */
function countingTranscriber(error?: Error): Transcriber & { calls: number } {
  const t = {
    calls: 0,
    async transcribe() {
      t.calls += 1;
      if (error) throw error;
      return "dobar dan";
    },
  };
  return t;
}

describe("request errors answer 4xx, other errors stay 500", () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let transcriber: ReturnType<typeof countingTranscriber>;

  async function start(t: ReturnType<typeof countingTranscriber>) {
    transcriber = t;
    app = buildApp({ db: dbHandle.db, transcriber, minter: fakeMinter() });
    await app.ready();
  }

  async function register(email: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: "password1" },
    });
  }

  function audioForm() {
    const form = new FormData();
    form.append("targetPhrase", "Dobar dan");
    form.append("audio", Buffer.from("fake-wav-bytes"), { filename: "clip.wav", contentType: "audio/wav" });
    return form;
  }

  beforeEach(async () => {
    dbHandle = await createTestDb();
  });

  afterEach(async () => {
    await app.close();
    await dbHandle.close();
  });

  it("B16-AC-1: malformed JSON body to login is answered 400 Bad Request without the parser message", async () => {
    await start(countingTranscriber());
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/json" },
      payload: '{"email":',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Bad Request" });
    expect(res.body).not.toContain("JSON");
    expect(res.body).not.toContain("Unexpected");
  });

  it("B16-AC-2: unsupported content type to login is answered 415 Unsupported Media Type without echoing it", async () => {
    await start(countingTranscriber());
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "application/xml" },
      payload: "<login><email>a@example.com</email></login>",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual({ error: "Unsupported Media Type" });
    expect(res.body).not.toContain("xml");
  });

  it("B16-AC-3: non-multipart pronunciation request is answered 406 Not Acceptable and saves no attempt", async () => {
    await start(countingTranscriber());
    const reg = await register("speaker@example.com");
    const token = reg.json().accessToken;
    const res = await app.inject({
      method: "POST",
      url: "/api/pronunciation",
      headers: { authorization: `Bearer ${token}` },
      payload: { targetPhrase: "dobar dan" },
    });
    expect(res.statusCode).toBe(406);
    expect(res.json()).toEqual({ error: "Not Acceptable" });
    expect(transcriber.calls).toBe(0);
    const rows = await dbHandle.db.select().from(pronunciationAttempts);
    expect(rows).toHaveLength(0);
  });

  it("B16-AC-4: two concurrent registrations of one email are answered 200 and 409 and leave one user", async () => {
    await start(countingTranscriber());
    const email = "race@example.com";
    const [a, b] = await Promise.all([register(email), register(email)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
    const conflict = a.statusCode === 409 ? a : b;
    expect(conflict.json()).toEqual({ error: "Email already registered" });

    const userRows = await dbHandle.db.select().from(users).where(eq(users.email, email));
    expect(userRows).toHaveLength(1);
    const statRows = await dbHandle.db.select().from(userStats).where(eq(userStats.userId, userRows[0]!.id));
    expect(statRows).toHaveLength(1);
  });

  it("B16-AC-5: errors without a 4xx statusCode are still answered 500 without their message", async () => {
    await start(countingTranscriber(new Error("transcriber exploded")));
    const reg = await register("boom@example.com");
    const token = reg.json().accessToken;

    const form = audioForm();
    const res = await app.inject({
      method: "POST",
      url: "/api/pronunciation",
      headers: { authorization: `Bearer ${token}`, ...form.getHeaders() },
      payload: form.getBuffer(),
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "Internal server error" });
    expect(res.body).not.toContain("exploded");

    await app.close();
    const upstream = Object.assign(new Error("upstream bad gateway"), { statusCode: 502 });
    await start(countingTranscriber(upstream));
    const reg2 = await register("boom2@example.com");
    const form2 = audioForm();
    const res2 = await app.inject({
      method: "POST",
      url: "/api/pronunciation",
      headers: { authorization: `Bearer ${reg2.json().accessToken}`, ...form2.getHeaders() },
      payload: form2.getBuffer(),
    });
    expect(res2.statusCode).toBe(500);
    expect(res2.json()).toEqual({ error: "Internal server error" });
    expect(res2.body).not.toContain("bad gateway");
  });
});
