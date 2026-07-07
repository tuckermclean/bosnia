import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Skill } from "../src/schema.js";

const sampleSkill: Skill = {
  id: "a1-u1-s1",
  order: 1,
  title: "Pozdravi",
  titleEn: "Greetings",
  grammarTip: "Sample grammar tip with č ć đ š ž dž lj nj for hygiene checks.",
  reviewStatus: "unreviewed",
  vocab: [
    { bs: "zdravo", en: "hello" },
    { bs: "hvala", en: "thank you" },
  ],
  lessons: [
    {
      id: "a1-u1-s1-l1",
      order: 1,
      title: "Lekcija",
      exercises: [
        {
          id: "a1-u1-s1-l1-e1",
          type: "listen_choose",
          prompt: "Poslušaj",
          targetPhrase: "Dobro jutro",
          answer: "Good morning",
          choices: ["Good morning", "Good night"],
        },
        {
          id: "a1-u1-s1-l1-e2",
          type: "speak",
          prompt: "Reci",
          // Deliberately the same text as a vocab entry, to exercise in-run caching.
          targetPhrase: "zdravo",
        },
      ],
    },
  ],
};

describe("synthesizeAudio (dry-run, no AZURE_SPEECH_KEY)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "content-audio-test-"));
    vi.resetModules();
    process.env.CONTENT_DATA_ROOT = tmpDir;
    delete process.env.AZURE_SPEECH_KEY;
    delete process.env.AZURE_SPEECH_REGION;

    const { SKILLS_DIR, skillFilePath } = await import("../src/paths.js");
    await mkdir(SKILLS_DIR, { recursive: true });
    await writeFile(skillFilePath(sampleSkill.id), JSON.stringify(sampleSkill, null, 2), "utf-8");
  });

  afterEach(async () => {
    delete process.env.CONTENT_DATA_ROOT;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes a manifest with placeholder URLs and never touches the network", async () => {
    const { synthesizeAudio } = await import("../src/synthesize-audio.js");
    const { AUDIO_MANIFEST_PATH } = await import("../src/paths.js");

    const result = await synthesizeAudio();

    expect(result.dryRun).toBe(true);
    // 3 distinct texts: "zdravo", "hvala", "Dobro jutro" — the speak exercise's
    // "zdravo" target phrase reuses the vocab entry's hash, so it's a same-run cache hit.
    expect(result.synthesized).toBe(3);
    expect(result.cached).toBe(1);

    const manifestOnDisk = JSON.parse(await readFile(AUDIO_MANIFEST_PATH, "utf-8"));
    const entries = Object.values(manifestOnDisk) as Array<{ url: string; text: string }>;
    expect(entries.length).toBe(3);
    for (const entry of entries) {
      expect(entry.url.startsWith("PLACEHOLDER://")).toBe(true);
    }
  });

  it("stamps a matching audioHash back onto vocab and target-phrase exercises", async () => {
    const { synthesizeAudio, contentHash } = await import("../src/synthesize-audio.js");
    const { skillFilePath } = await import("../src/paths.js");

    await synthesizeAudio();

    const updated: Skill = JSON.parse(await readFile(skillFilePath(sampleSkill.id), "utf-8"));
    const expectedHash = contentHash("zdravo", "bs-BA-VesnaNeural");
    expect(updated.vocab[0]!.audioHash).toBe(expectedHash);

    const speakEx = updated.lessons[0]!.exercises[1]!;
    expect(speakEx.type).toBe("speak");
    if (speakEx.type === "speak") {
      expect(speakEx.audioHash).toBe(expectedHash); // same text as vocab[0] -> same hash
    }
  });

  it("is idempotent: a second run synthesizes nothing new (fully cached)", async () => {
    const { synthesizeAudio } = await import("../src/synthesize-audio.js");

    const first = await synthesizeAudio();
    expect(first.synthesized).toBe(3);

    const second = await synthesizeAudio();
    expect(second.synthesized).toBe(0);
    expect(second.cached).toBe(3);
  });
});
