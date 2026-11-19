import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

// ---- B13: docs and package scripts stay in step ----

const repoRoot = resolve(backendDir, "..");
type Pkg = { name?: string; scripts: Record<string, string> };
type Command = { script: string; pkg: string };

function readPkg(dir: string): Pkg {
  return JSON.parse(readFileSync(resolve(repoRoot, dir, "package.json"), "utf8"));
}

// Maps a workspace given as a package name or a folder to a package key; a name that
// matches no package stays unresolved, so the docs check reports it as missing.
const workspaces: Record<string, string> = {
  bosanski: "root",
  ".": "root",
  "@bosanski/backend": "backend",
  backend: "backend",
  "@bosanski/content": "content",
  content: "content",
};
function resolveWorkspace(name: string): string {
  return workspaces[name] ?? `unknown:${name}`;
}

// Finds each `npm run <script>` and `npm test` in a text, with the package it names.
function parseCommands(text: string, ownPackage: string): Command[] {
  const found: Command[] = [];
  for (const line of text.split("\n")) {
    const re = /\bnpm\s+(?:run\s+(\w[\w:.-]*)|(test)\b)([^`;|&)\n]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const script = m[1] ?? "test";
      const rest = (m[3] ?? "").split(/\s--(?:\s|$)/)[0] ?? "";
      const ws = /(?:^|\s)(?:-w|--workspace)(?:\s+|=)(\S+)/.exec(rest);
      found.push({ script, pkg: ws ? resolveWorkspace(ws[1]!) : ownPackage });
    }
  }
  return found;
}

describe("B13-AC-4: the parser", () => {
  it("B13-AC-4: finds the script and package of a -w command", () => {
    expect(parseCommands("npm run generate -w @bosanski/content", "root")).toEqual([
      { script: "generate", pkg: "content" },
    ]);
  });

  it("B13-AC-4: finds the script and package of a --workspace= command", () => {
    expect(parseCommands("npm run db:x --workspace=@bosanski/backend", "root")).toEqual([
      { script: "db:x", pkg: "backend" },
    ]);
    expect(parseCommands("npm test --workspace @bosanski/backend", "root")).toEqual([
      { script: "test", pkg: "backend" },
    ]);
  });

  it("B13-AC-4: resolves a workspace by package name or folder, and never takes a flag as the script", () => {
    expect(parseCommands("npm run generate -w content", "root")).toEqual([{ script: "generate", pkg: "content" }]);
    expect(parseCommands("npm run -w @bosanski/content generate", "root").map((c) => c.script)).not.toContain("-w");
    expect(parseCommands("npm run x -w @bosanski/nope", "root")).toEqual([{ script: "x", pkg: "unknown:@bosanski/nope" }]);
  });

  it("B13-AC-4: finds a bare command in the document's own package", () => {
    expect(parseCommands("Run `npm run validate` now", "content")).toEqual([
      { script: "validate", pkg: "content" },
    ]);
    expect(parseCommands("npm test", "root")).toEqual([{ script: "test", pkg: "root" }]);
  });

  it("B13-AC-4: does not take arguments after -- as script names", () => {
    expect(parseCommands("npm run apply-review -w @bosanski/content -- <unitId>", "root")).toEqual([
      { script: "apply-review", pkg: "content" },
    ]);
    expect(parseCommands("npm run blueprint -- --force", "content")).toEqual([
      { script: "blueprint", pkg: "content" },
    ]);
    expect(parseCommands("npm run blueprint -- npm run other", "content")).toEqual([
      { script: "blueprint", pkg: "content" },
    ]);
  });

  it("B13-AC-4: finds nothing in a line with no command", () => {
    expect(parseCommands("Nothing to run here, see the npm docs.", "root")).toEqual([]);
  });
});

describe("B13-AC-3: documented npm commands name existing scripts", () => {
  const pkgs: Record<string, Pkg> = {
    root: readPkg("."),
    backend: readPkg("backend"),
    content: readPkg("content"),
  };
  const docs = [
    { doc: "DEPLOY.md", own: "root" },
    { doc: "content/README.md", own: "content" },
  ];

  for (const { doc, own } of docs) {
    it(`B13-AC-3: every command in ${doc} names a script that exists`, () => {
      const text = readFileSync(resolve(repoRoot, doc), "utf8");
      const missing: string[] = [];
      for (const c of parseCommands(text, own)) {
        const pkg = pkgs[c.pkg];
        if (!pkg || !(c.script in pkg.scripts)) {
          missing.push(`${c.script} (document ${doc}, package ${c.pkg})`);
        }
      }
      expect(missing, `missing scripts: ${missing.join("; ")}`).toEqual([]);
    });
  }

  it("B13-AC-3: content/README.md commands include the six stage scripts", () => {
    const text = readFileSync(resolve(repoRoot, "content/README.md"), "utf8");
    const names = parseCommands(text, "content").map((c) => c.script);
    for (const s of ["blueprint", "generate", "validate", "audio", "export-review", "apply-review"]) {
      expect(names, `stage script ${s}`).toContain(s);
    }
  });
});

describe("B13-AC-2: package scripts run files that exist", () => {
  for (const dir of ["backend", "content"]) {
    it(`B13-AC-2: every tsx script of ${dir} names an existing file`, () => {
      const missing: string[] = [];
      for (const [name, cmd] of Object.entries(readPkg(dir).scripts)) {
        const m = /^tsx\s+(?:watch\s+)?(\S+)/.exec(cmd);
        if (m && !existsSync(resolve(repoRoot, dir, m[1]!))) {
          missing.push(`${name} runs ${m[1]} (package ${dir})`);
        }
      }
      expect(missing, `missing files: ${missing.join("; ")}`).toEqual([]);
    });

    it(`B13-AC-2: no script of ${dir} runs drizzle-kit without backend/drizzle.config.ts`, () => {
      if (existsSync(resolve(repoRoot, "backend", "drizzle.config.ts"))) return;
      const offenders = Object.entries(readPkg(dir).scripts)
        .filter(([, cmd]) => /\bdrizzle-kit\b/.test(cmd))
        .map(([name, cmd]) => `${name}: ${cmd} (package ${dir})`);
      expect(offenders, `drizzle-kit scripts: ${offenders.join("; ")}`).toEqual([]);
    });
  }
});

describe("B13-AC-1: backend has no dangling db scripts", () => {
  it("B13-AC-1: backend/package.json defines neither db:migrate nor db:generate", () => {
    const { scripts } = readBackendPackage();
    expect(scripts).not.toHaveProperty("db:migrate");
    expect(scripts).not.toHaveProperty("db:generate");
  });
});
