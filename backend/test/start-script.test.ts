import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { posix, resolve } from "node:path";

const backendDir = fileURLToPath(new URL("..", import.meta.url));

// Where tsc emits a source file: its path relative to rootDir, under outDir, with .ts -> .js.
function emittedPath(source: string, outDir: string, rootDir: string): string {
  const rel = posix.relative(posix.normalize(rootDir), posix.normalize(source));
  return posix.join(posix.normalize(outDir), rel.replace(/\.ts$/, ".js"));
}

function readJson(file: string): any {
  return JSON.parse(readFileSync(resolve(backendDir, file), "utf8"));
}

describe("pin B01-AC-4: build places the entrypoint at dist/src/index.js", () => {
  const pkg = readJson("package.json");
  const { outDir, rootDir } = readJson("tsconfig.json").compilerOptions;

  it("B01-AC-4: build compiles with tsc -p tsconfig.json", () => {
    expect(pkg.scripts.build).toMatch(/^tsc\s+-p\s+tsconfig\.json\b/);
  });

  it("B01-AC-4: the server entrypoint lands at dist/src/index.js", () => {
    expect(existsSync(resolve(backendDir, "src/index.ts"))).toBe(true);
    expect(emittedPath("src/index.ts", outDir, rootDir)).toBe("dist/src/index.js");
  });

  it("B01-AC-4: the seed script lands at dist/scripts/seed-course.js", () => {
    expect(existsSync(resolve(backendDir, "scripts/seed-course.ts"))).toBe(true);
    expect(emittedPath("scripts/seed-course.ts", outDir, rootDir)).toBe("dist/scripts/seed-course.js");
  });
});
