import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MockProvider } from "../src/llm.js";
import type { SkillBlueprint, UnitBlueprint } from "../src/schema.js";

const skillBp: SkillBlueprint = {
  id: "a1-u1-s1",
  order: 1,
  title: "Pozdravi",
  titleEn: "Greetings",
  grammarFocus: "informal vs formal address",
  targetVocabCount: 2,
};

const unitBp: UnitBlueprint = {
  id: "a1-u1",
  level: "A1",
  order: 1,
  title: "Osnove",
  titleEn: "Basics",
  theme: "Test theme for resumability checks.",
  skills: [skillBp],
};

const canned = {
  id: "a1-u1-s1",
  order: 1,
  title: "Pozdravi",
  titleEn: "Greetings",
  grammarTip: "Sample grammar tip with č ć đ š ž dž lj nj.",
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
          type: "speak",
          prompt: "Reci",
          targetPhrase: "zdravo",
        },
      ],
    },
  ],
};

describe("generateSkill resumability (MockProvider, offline)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "content-genskill-test-"));
    vi.resetModules();
    process.env.CONTENT_DATA_ROOT = tmpDir;
  });

  afterEach(async () => {
    delete process.env.CONTENT_DATA_ROOT;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("generates and writes a skill file on first run, calling the LLM (draft + self-review)", async () => {
    const { generateSkill } = await import("../src/generate-skill.js");
    const { skillFilePath } = await import("../src/paths.js");
    const { existsSync } = await import("node:fs");

    const provider = new MockProvider().when("a1-u1-s1", JSON.stringify(canned));
    const result = await generateSkill(unitBp, skillBp, { provider });

    expect(result.skipped).toBe(false);
    expect(result.skill.id).toBe("a1-u1-s1");
    expect(existsSync(skillFilePath("a1-u1-s1"))).toBe(true);
    // One call for the initial draft, one for the self-review pass.
    expect(provider.calls.length).toBe(2);
  });

  it("skips regeneration (no LLM call) on a second run without --force", async () => {
    const { generateSkill } = await import("../src/generate-skill.js");

    const provider = new MockProvider().when("a1-u1-s1", JSON.stringify(canned));
    await generateSkill(unitBp, skillBp, { provider });
    expect(provider.calls.length).toBe(2);

    const second = await generateSkill(unitBp, skillBp, { provider });
    expect(second.skipped).toBe(true);
    expect(second.skill.id).toBe("a1-u1-s1");
    // No new calls made — the cached file was used instead.
    expect(provider.calls.length).toBe(2);
  });

  it("regenerates when force:true is passed, even if a cached file exists", async () => {
    const { generateSkill } = await import("../src/generate-skill.js");

    const provider = new MockProvider().when("a1-u1-s1", JSON.stringify(canned));
    await generateSkill(unitBp, skillBp, { provider });
    expect(provider.calls.length).toBe(2);

    const forced = await generateSkill(unitBp, skillBp, { provider, force: true });
    expect(forced.skipped).toBe(false);
    expect(provider.calls.length).toBe(4);
  });

  it("falls back to the validated draft if the self-review pass returns garbage", async () => {
    const { generateSkill } = await import("../src/generate-skill.js");

    let callCount = 0;
    const provider = new MockProvider((prompt) => {
      callCount += 1;
      // First call (draft) returns valid JSON; second call (review) returns garbage.
      return callCount === 1 ? JSON.stringify(canned) : "not valid json {{{";
    });

    const result = await generateSkill(unitBp, skillBp, { provider });
    expect(result.skipped).toBe(false);
    expect(result.skill.id).toBe("a1-u1-s1");
    expect(result.skill.vocab.length).toBe(2);
  });
});
