import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const backendDir = fileURLToPath(new URL("..", import.meta.url));

function readBackendPackage(): { scripts: Record<string, string> } {
  return JSON.parse(readFileSync(`${backendDir}package.json`, "utf8"));
}

describe("pin B01-AC-3: backend dev, seed and smoke:groq scripts", () => {
  const { scripts } = readBackendPackage();

  it("B01-AC-3: seed runs scripts/seed-course.ts with tsx", () => {
    expect(scripts.seed).toMatch(/^tsx\s+scripts\/seed-course\.ts\b/);
  });

  it("B01-AC-3: smoke:groq runs scripts/smoke-groq.ts with tsx", () => {
    expect(scripts["smoke:groq"]).toMatch(/^tsx\s+scripts\/smoke-groq\.ts\b/);
  });

  it("B01-AC-3: dev runs src/index.ts with tsx in watch mode", () => {
    expect(scripts.dev).toMatch(/^tsx\s+watch\s+src\/index\.ts\b/);
  });
});
