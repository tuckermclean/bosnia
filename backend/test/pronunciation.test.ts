import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
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
