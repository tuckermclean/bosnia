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

// ---------------------------------------------------------------------------
// B14: start, main and the image CMD follow the compiled entrypoint.
// ---------------------------------------------------------------------------

// Where tsc emits a source file (relative to the package folder), or throws naming a missing option.
function compiledPath(source: string, compilerOptions: { outDir?: string; rootDir?: string }): string {
  for (const option of ["outDir", "rootDir"] as const) {
    if (typeof compilerOptions[option] !== "string" || compilerOptions[option] === "") {
      throw new Error(`tsconfig.json compilerOptions.${option} is missing`);
    }
  }
  return emittedPath(source, compilerOptions.outDir!, compilerOptions.rootDir!);
}

// Throws a message carrying the expected and the actual value when they differ.
function checkEqual(what: string, expected: unknown, actual: unknown): void {
  if (expected !== actual) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`);
  }
}

// The last CMD of a Dockerfile, which must be exec form (a JSON array of strings).
function lastCmdExec(dockerfile: string): string[] {
  const cmds = dockerfile
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^CMD(\s|$)/i.test(l));
  if (cmds.length === 0) throw new Error("Dockerfile has no CMD instruction");
  const args = cmds[cmds.length - 1]!.replace(/^CMD\s*/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    throw new Error(`last CMD is in shell form, not exec form: CMD ${args}`);
  }
  if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
    throw new Error(`last CMD is in shell form, not exec form: CMD ${args}`);
  }
  return parsed;
}

describe("B14-AC-4: the mapping from a source file to its compiled path", () => {
  it("B14-AC-4: rootDir . and outDir dist give dist/src/index.js", () => {
    expect(compiledPath("src/index.ts", { outDir: "dist", rootDir: "." })).toBe("dist/src/index.js");
  });
  it("B14-AC-4: rootDir src and outDir dist give dist/index.js", () => {
    expect(compiledPath("src/index.ts", { outDir: "dist", rootDir: "src" })).toBe("dist/index.js");
  });
  it("B14-AC-4: rootDir ./ and outDir ./build/ give build/src/index.js", () => {
    expect(compiledPath("src/index.ts", { outDir: "./build/", rootDir: "./" })).toBe("build/src/index.js");
  });
});

describe("B14-AC-2: the checks name the option or the expected and actual values", () => {
  it("B14-AC-2: a missing outDir fails naming outDir", () => {
    expect(() => compiledPath("src/index.ts", { rootDir: "." })).toThrow(/outDir/);
  });
  it("B14-AC-2: a missing rootDir fails naming rootDir", () => {
    expect(() => compiledPath("src/index.ts", { outDir: "dist" })).toThrow(/rootDir/);
  });
  it("B14-AC-2: a mismatch names the expected and the actual value", () => {
    expect(() => checkEqual("scripts.start", "node dist/src/index.js", "node dist/index.js")).toThrow(
      /node dist\/src\/index\.js[\s\S]*node dist\/index\.js/,
    );
    expect(() => checkEqual("scripts.start", "a", "a")).not.toThrow();
  });
});

describe("B14-AC-3: the last CMD parser", () => {
  it("B14-AC-3: a Dockerfile with no CMD fails with that reason", () => {
    expect(() => lastCmdExec("FROM node:22-slim\nRUN true\n")).toThrow(/no CMD/);
  });
  it("B14-AC-3: a shell-form last CMD fails with that reason", () => {
    expect(() => lastCmdExec('FROM x\nCMD ["a"]\nCMD node backend/dist/src/index.js\n')).toThrow(/shell form/);
  });
  it("B14-AC-3: the last CMD in exec form is returned", () => {
    expect(lastCmdExec('FROM x\nCMD ["a"]\nFROM y\nCMD ["node", "b.js"]\n')).toEqual(["node", "b.js"]);
  });
});

describe("B14-AC-1, B14-AC-2, B14-AC-3: start, main and the image CMD follow the compiled entrypoint", () => {
  const pkg = readJson("package.json");
  const compilerOptions = readJson("tsconfig.json").compilerOptions;

  it("B14-AC-2: backend/src/index.ts exists", () => {
    expect(existsSync(resolve(backendDir, "src/index.ts"))).toBe(true);
  });

  it("B14-AC-1, B14-AC-2: scripts.start is exactly node <entrypoint>", () => {
    const entrypoint = compiledPath("src/index.ts", compilerOptions);
    checkEqual("scripts.start", `node ${entrypoint}`, pkg.scripts.start);
  });

  it("B14-AC-1, B14-AC-2: main is exactly <entrypoint>", () => {
    const entrypoint = compiledPath("src/index.ts", compilerOptions);
    checkEqual("main", entrypoint, pkg.main);
  });

  it("B14-AC-3: the last CMD of backend/Dockerfile is [node, backend/<entrypoint>] in exec form", () => {
    const entrypoint = compiledPath("src/index.ts", compilerOptions);
    const cmd = lastCmdExec(readFileSync(resolve(backendDir, "Dockerfile"), "utf8"));
    checkEqual("Dockerfile last CMD", JSON.stringify(["node", `backend/${entrypoint}`]), JSON.stringify(cmd));
  });
});
