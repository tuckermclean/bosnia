import { describe, it, expect } from "vitest";
import {
  normalizeText,
  levenshtein,
  charSimilarity,
  scorePronunciation,
} from "../src/services/scoring.js";

describe("normalizeText", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeText("  Dobar   dan! ")).toBe("dobar dan");
    expect(normalizeText("Kako si?")).toBe("kako si");
  });

  it("preserves Bosnian diacritics", () => {
    expect(normalizeText("Čašćavaš đaka, žašto?")).toBe("čašćavaš đaka žašto");
  });

  it("treats hyphens as word separators", () => {
    expect(normalizeText("crno-bijeli")).toBe("crno bijeli");
  });
});

describe("levenshtein", () => {
  it("is zero for identical strings", () => {
    expect(levenshtein("hvala", "hvala")).toBe(0);
  });
  it("counts single edits", () => {
    expect(levenshtein("hvala", "hvale")).toBe(1); // substitution
    expect(levenshtein("hvala", "hval")).toBe(1); // deletion
    expect(levenshtein("", "abc")).toBe(3);
  });
});

describe("charSimilarity", () => {
  it("is 1 for identical, 0 for fully different length-1", () => {
    expect(charSimilarity("a", "a")).toBe(1);
    expect(charSimilarity("a", "b")).toBe(0);
  });
  it("treats two empties as identical", () => {
    expect(charSimilarity("", "")).toBe(1);
  });
});

describe("scorePronunciation", () => {
  it("gives a perfect score for an exact match", () => {
    const r = scorePronunciation("Dobar dan", "dobar dan");
    expect(r.score).toBe(100);
    expect(r.perWord.every((w) => w.matched)).toBe(true);
    expect(r.perWord).toHaveLength(2);
  });

  it("is invariant to case and punctuation", () => {
    const r = scorePronunciation("Dobar dan!", "  DOBAR   DAN. ");
    expect(r.score).toBe(100);
  });

  it("scores an empty transcript as zero with all words unmatched", () => {
    const r = scorePronunciation("Kako si danas", "");
    expect(r.score).toBe(0);
    expect(r.perWord.every((w) => !w.matched)).toBe(true);
    expect(r.perWord).toHaveLength(3);
  });

  it("marks one wrong word out of three as unmatched and keeps the score partial", () => {
    // learner said "kako" wrong -> "mako"
    const r = scorePronunciation("kako si danas", "mako si danas");
    const matched = r.perWord.filter((w) => w.matched).length;
    expect(matched).toBe(2);
    expect(r.perWord[0]?.matched).toBe(false);
    expect(r.score).toBeGreaterThan(40);
    expect(r.score).toBeLessThan(90);
  });

  it("accepts a minor mispronunciation within the tolerance threshold", () => {
    // "hvala" heard as "hvale" — one char off, should still count as matched
    const r = scorePronunciation("hvala", "hvale");
    expect(r.perWord[0]?.matched).toBe(true);
    expect(r.score).toBeGreaterThan(70);
  });

  it("penalizes extra inserted words but stays above zero", () => {
    const clean = scorePronunciation("dobar dan", "dobar dan");
    const noisy = scorePronunciation("dobar dan", "dobar dan ovaj eee");
    expect(noisy.score).toBeLessThan(clean.score);
    expect(noisy.score).toBeGreaterThan(0);
    // the two real target words are still recognized
    expect(noisy.perWord.filter((w) => w.matched)).toHaveLength(2);
  });

  it("is deterministic", () => {
    const a = scorePronunciation("kako si danas", "kako su danas");
    const b = scorePronunciation("kako si danas", "kako su danas");
    expect(a).toEqual(b);
  });

  it("reports what was heard for each target word", () => {
    const r = scorePronunciation("dobar dan", "dobar noc");
    expect(r.perWord[0]?.heard).toBe("dobar");
    expect(r.perWord[1]?.heard).toBe("noc");
    expect(r.transcript).toBe("dobar noc");
    expect(r.targetText).toBe("dobar dan");
  });
});
