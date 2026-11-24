import { describe, it, expect } from "vitest";
import { computeStreak } from "../src/routes/progress.js";

const d = (s: string) => new Date(s);

describe("computeStreak counts UTC days", () => {
  it("B17-AC-2: raises the streak by one from 23:59:59Z to the next UTC midnight", () => {
    expect(computeStreak(d("2026-01-09T23:59:59Z"), d("2026-01-10T00:00:00Z"), 3)).toBe(4);
  });

  it("B17-AC-2: keeps the streak within one UTC day", () => {
    expect(computeStreak(d("2026-01-10T00:00:00Z"), d("2026-01-10T23:59:59Z"), 3)).toBe(3);
  });

  it("B17-AC-2: resets the streak to 1 after a skipped UTC day (25 hours apart)", () => {
    expect(computeStreak(d("2026-01-08T23:30:00Z"), d("2026-01-10T00:30:00Z"), 3)).toBe(1);
  });

  describe("under America/Los_Angeles", () => {
    const hadTZ = Object.prototype.hasOwnProperty.call(process.env, "TZ");
    const oldTZ = process.env.TZ;

    function useLosAngeles() {
      process.env.TZ = "America/Los_Angeles";
      const day = new Date("2026-01-10T02:00:00Z").getDate();
      if (day !== 9) {
        throw new Error(`the America/Los_Angeles time zone did not take effect (local day is ${day}, expected 9)`);
      }
    }

    function restoreTZ() {
      if (hadTZ) process.env.TZ = oldTZ;
      else delete process.env.TZ;
    }

    it("B17-AC-3: same Los Angeles day but consecutive UTC days gives 4", () => {
      try {
        useLosAngeles();
        expect(computeStreak(d("2026-01-09T20:00:00Z"), d("2026-01-10T02:00:00Z"), 3)).toBe(4);
      } finally {
        restoreTZ();
      }
    });

    it("B17-AC-3: consecutive Los Angeles days but the same UTC day gives 3", () => {
      try {
        useLosAngeles();
        expect(computeStreak(d("2026-01-10T01:00:00Z"), d("2026-01-10T09:00:00Z"), 3)).toBe(3);
      } finally {
        restoreTZ();
      }
    });

    it("B17-AC-3: the time zone is restored after the cases", () => {
      expect(process.env.TZ).toBe(oldTZ);
      expect(Object.prototype.hasOwnProperty.call(process.env, "TZ")).toBe(hadTZ);
    });
  });
});
