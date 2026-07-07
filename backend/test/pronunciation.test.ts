import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import FormData from "form-data";
import { eq } from "drizzle-orm";
import { buildApp, MAX_UPLOAD_BYTES } from "../src/app.js";
import { processPronunciation } from "../src/routes/pronunciation.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { pronunciationAttempts, users } from "../src/db/schema.js";
import { scorePronunciation } from "../src/services/scoring.js";
import { fakeTranscriber, fakeMinter } from "./helpers.js";

describe("processPronunciation", () => {
  let dbHandle: DbHandle;

  beforeEach(async () => {
    dbHandle = await createTestDb();
    await dbHandle.db.insert(users).values({ id: "user-1", email: "u@example.com", passwordHash: "x" });
  });

  afterEach(async () => {
    await dbHandle.close();
  });

  it("scores against the fake transcript exactly like scorePronunciation and persists the attempt", async () => {
    const target = "Dobar dan";
    const transcript = "dobar dan";
    const deps = { db: dbHandle.db, transcriber: fakeTranscriber(transcript), minter: fakeMinter() };

    const result = await processPronunciation(deps, {
      userId: "user-1",
      targetPhrase: target,
      exerciseId: undefined,
      audio: Buffer.from("fake-audio-bytes"),
      filename: "sample.webm",
    });

    const expected = scorePronunciation(target, transcript);
    expect(result.score).toBe(expected.score);
    expect(result.perWord).toEqual(expected.perWord);
    expect(result.transcript).toBe(expected.transcript);

    const rows = await dbHandle.db
      .select()
      .from(pronunciationAttempts)
      .where(eq(pronunciationAttempts.userId, "user-1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe(expected.score);
    expect(rows[0]?.targetPhrase).toBe(target);
    expect(rows[0]?.transcript).toBe(expected.transcript);
    expect(rows[0]?.perWord).toEqual(expected.perWord);
    expect(rows[0]?.exerciseId).toBeNull();
  });

  it("records the exerciseId when provided", async () => {
    const deps = { db: dbHandle.db, transcriber: fakeTranscriber("kako si"), minter: fakeMinter() };
    await processPronunciation(deps, {
      userId: "user-1",
      targetPhrase: "Kako si",
      exerciseId: "exercise-42",
      audio: Buffer.from("more-fake-bytes"),
      filename: "sample2.webm",
    });

    const rows = await dbHandle.db
      .select()
      .from(pronunciationAttempts)
      .where(eq(pronunciationAttempts.userId, "user-1"));
    expect(rows.find((r) => r.exerciseId === "exercise-42")).toBeTruthy();
  });
});

describe("POST /api/pronunciation (real HTTP multipart path)", () => {
  let httpDbHandle: DbHandle;
  let app: FastifyInstance;
  let accessToken: string;

  beforeEach(async () => {
    httpDbHandle = await createTestDb();
    app = buildApp({
      db: httpDbHandle.db,
      transcriber: fakeTranscriber("dobar dan"),
      minter: fakeMinter(),
    });
    await app.ready();

    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "speaker@example.com", password: "password1" },
    });
    accessToken = register.json().accessToken;
  });

  afterEach(async () => {
    await app.close();
    await httpDbHandle.close();
  });

  it("scores a real multipart audio upload end-to-end", async () => {
    const form = new FormData();
    form.append("targetPhrase", "Dobar dan");
    form.append("exerciseId", "exercise-1");
    form.append("audio", Buffer.from("fake-wav-bytes"), { filename: "clip.wav", contentType: "audio/wav" });

    const res = await app.inject({
      method: "POST",
      url: "/api/pronunciation",
      headers: { authorization: `Bearer ${accessToken}`, ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const expected = scorePronunciation("Dobar dan", "dobar dan");
    expect(body.score).toBe(expected.score);
    expect(body.transcript).toBe(expected.transcript);

    const rows = await httpDbHandle.db.select().from(pronunciationAttempts);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.exerciseId).toBe("exercise-1");
  });

  it("rejects a non-audio content type with 415", async () => {
    const form = new FormData();
    form.append("targetPhrase", "Dobar dan");
    form.append("audio", Buffer.from("not audio"), { filename: "clip.txt", contentType: "text/plain" });

    const res = await app.inject({
      method: "POST",
      url: "/api/pronunciation",
      headers: { authorization: `Bearer ${accessToken}`, ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(415);
  });

  it("rejects an oversize upload with 413", async () => {
    const form = new FormData();
    form.append("targetPhrase", "Dobar dan");
    form.append("audio", Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 1), {
      filename: "huge.wav",
      contentType: "audio/wav",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/pronunciation",
      headers: { authorization: `Bearer ${accessToken}`, ...form.getHeaders() },
      payload: form.getBuffer(),
    });

    expect(res.statusCode).toBe(413);
  });
});
