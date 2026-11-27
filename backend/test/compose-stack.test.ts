import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// README.md relative to this test file (backend/test/ -> repo root).
const readme = readFileSync(fileURLToPath(new URL("../../README.md", import.meta.url)), "utf8");

// Sections keyed by their `## ` heading text; a section added later breaks nothing here.
function sections(): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of readme.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    out.set(part.slice(0, nl).trim(), part.slice(nl + 1));
  }
  return out;
}

function sectionStarting(prefix: string): string {
  for (const [title, body] of sections()) {
    if (title.toLowerCase().startsWith(prefix.toLowerCase())) return body;
  }
  throw new Error(`README.md has no "## ${prefix}" section`);
}

describe("pin R02-AC-1: README.md describes the packages, design, local development and CI/CD", () => {
  it("R02-AC-1: describes the four packages in the monorepo layout", () => {
    const body = sectionStarting("Monorepo layout");
    for (const pkg of ["`app/`", "`backend/`", "`voice-agent/`", "`content/`"]) {
      expect(body).toContain(pkg);
    }
  });

  it("R02-AC-1: has a non-empty 'How the pieces fit' section", () => {
    expect(sectionStarting("How the pieces fit").trim().length).toBeGreaterThan(0);
  });

  it("R02-AC-1: has a non-empty 'Key decisions' section", () => {
    expect(sectionStarting("Key decisions").trim().length).toBeGreaterThan(0);
  });

  it("R02-AC-1: local development runs without Docker, on PGlite, with the backend tests", () => {
    const body = sectionStarting("Local development");
    expect(body).toContain("No Docker required");
    expect(body).toContain("PGlite");
    expect(body).toContain("npm test -w @bosanski/backend");
  });

  it("R02-AC-1: the CI/CD section points to DEPLOY.md", () => {
    expect(sectionStarting("CI/CD")).toContain("DEPLOY.md");
  });
});
