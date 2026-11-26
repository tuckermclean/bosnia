import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parse } from "yaml";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(backendDir, "..");

type Bullet = { label: string; text: string; firstLine: string; subs: string[] };

// Returns the "## Building a node" section of a document as its top-level bullets, each
// keyed by the bold label it starts with, with its text (wrapped lines kept, joined by
// newlines) and its sub-bullets.
function parseSection(doc: string, heading = "Building a node"): Map<string, Bullet> {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  const out = new Map<string, Bullet>();
  if (start < 0) return out;
  let cur: Bullet | null = null;
  let sub: string[] | null = null;
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    const top = /^- \*\*(.+?)\*\*/.exec(line);
    if (top) {
      cur = { label: top[1]!, text: line.slice(2), firstLine: line.slice(2), subs: [] };
      out.set(cur.label, cur);
      sub = null;
      continue;
    }
    if (!cur) continue;
    if (/^\s*$/.test(line)) {
      sub = null;
      continue;
    }
    const sb = /^\s+- (.*)$/.exec(line);
    if (sb) {
      cur.subs.push(sb[1]!);
      sub = cur.subs;
      cur.text += "\n" + line.trim();
      continue;
    }
    if (/^\s+\S/.test(line)) {
      cur.text += "\n" + line.trim();
      if (sub && sub.length > 0) sub[sub.length - 1] += "\n" + line.trim();
    }
  }
  return out;
}

function bullet(section: Map<string, Bullet>, label: string): Bullet {
  const b = section.get(label);
  expect(b, `missing bullet: ${label}`).toBeDefined();
  return b!;
}

// Returns the inline code spans of a text; a span wrapping onto the next line is joined
// with one space, as Markdown renders it.
function codeSpans(text: string): string[] {
  const spans: string[] = [];
  const re = /(`+)([\s\S]*?[^`])\1(?!`)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push(m[2]!.replace(/\s*\n\s*/g, " "));
  }
  return spans;
}

describe("R04: the section and code-span parsers", () => {
  const sample = [
    "# Title",
    "",
    "## Building a node",
    "",
    "- **Alpha.** First `one` and `wrapped",
    "  span` here.",
    "  - sub a: `x --y`;",
    "  - sub b: `z`",
    "    continues `q`.",
    "- **Beta:** `b1`, `b2`",
    "  (note); more.",
    "",
    "## Other",
    "",
    "- **Gamma.** outside",
  ].join("\n");

  it("R04-AC-1: the section holds the bullets up to the next heading, keyed by bold label", () => {
    const s = parseSection(sample);
    expect([...s.keys()]).toEqual(["Alpha.", "Beta:"]);
    expect(s.get("Beta:")!.firstLine).toBe("**Beta:** `b1`, `b2`");
  });

  it("R04-AC-1: a bullet keeps its wrapped lines and its sub-bullets", () => {
    const a = parseSection(sample).get("Alpha.")!;
    expect(a.subs).toEqual(["sub a: `x --y`;", "sub b: `z`\ncontinues `q`."]);
    expect(a.text).toContain("span` here.");
  });

  it("R04-AC-1: a missing bullet fails the test, naming the label", () => {
    const s = parseSection(sample);
    expect(() => bullet(s, "Nope.")).toThrow(/missing bullet: Nope\./);
  });

  it("R04-AC-1: code spans are found, and a wrapped span is joined with one space", () => {
    expect(codeSpans("a `one` b `two words` c")).toEqual(["one", "two words"]);
    expect(codeSpans("a `wrapped\n  span` b `c`")).toEqual(["wrapped span", "c"]);
    expect(codeSpans("no spans here")).toEqual([]);
  });

  it("R04-AC-1: a double-backtick span may contain a single backtick", () => {
    expect(codeSpans("x ``a `b` c`` y")).toEqual(["a `b` c"]);
  });
});

const agents = readFileSync(resolve(repoRoot, "AGENTS.md"), "utf8");
const graph = parse(readFileSync(resolve(repoRoot, "docs/graph.yaml"), "utf8")) as {
  gate: { command: string };
};
const section = parseSection(agents);

const runsRunner = (span: string) => /npm test -w|npm run test -w|npx vitest|npx jest/.test(span);
const namesTestFile = (span: string) => /<[^>]+>|\.test\.tsx?\b/.test(span);

describe("R04-AC-1: the quick gate's commands are bounded", () => {
  const expected: Record<string, string> = {
    backend: "npm test -w @bosanski/backend -- --maxWorkers=2 test/<name>.test.ts",
    content: "npm run test -w @bosanski/content -- --maxWorkers=2 test/<name>.test.ts",
    app: "(cd app && npx jest --maxWorkers=2 --runTestsByPath <path>)",
    "voice-agent": "(cd voice-agent && python3 -m unittest tests.<module>)",
  };
  for (const [pkg, want] of Object.entries(expected)) {
    it(`R04-AC-1: the ${pkg} command is ${want}`, () => {
      const sub = bullet(section, "Quick gate.").subs.find((s) => s.startsWith(`${pkg}:`));
      expect(sub, `Quick gate. has no sub-bullet for ${pkg}`).toBeDefined();
      const got = codeSpans(sub!)[0];
      expect(got, `quick gate ${pkg}: expected span ${want}, got ${got}`).toBe(want);
    });
  }
});

describe("R04-AC-2: every vitest or jest command is bounded and names a test file", () => {
  for (const label of ["Quick gate.", "Red target.", "Mutation and pin checks."]) {
    it(`R04-AC-2: ${label} passes --maxWorkers=2 and names a test file, and never --no-cache`, () => {
      const spans = codeSpans(bullet(section, label).text);
      const bad: string[] = [];
      for (const span of spans) {
        if (span.includes("--no-cache")) bad.push(`${label} --no-cache: ${span}`);
        if (runsRunner(span)) {
          if (!span.includes("--maxWorkers=2")) bad.push(`${label} no --maxWorkers=2: ${span}`);
          if (!namesTestFile(span)) bad.push(`${label} names no test file: ${span}`);
        }
      }
      expect(bad, `bad spans: ${bad.join("; ")}`).toEqual([]);
    });
  }
});

describe("R04-AC-2: the red-target examples", () => {
  it("R04-AC-2: the Red target. bullet's spans include the backend and app examples", () => {
    const spans = codeSpans(bullet(section, "Red target.").text);
    for (const ex of [
      "npm test -w @bosanski/backend -- --maxWorkers=2 test/auth.test.ts",
      "(cd app && npx jest --maxWorkers=2 --runTestsByPath __tests__/home.test.tsx)",
    ]) {
      expect(spans, `missing red-target example: ${ex}`).toContain(ex);
    }
  });

  it("R04-AC-2: no code span in the Red target. bullet names app/(tabs)/__tests__/", () => {
    const offending = codeSpans(bullet(section, "Red target.").text).filter((s) =>
      s.includes("app/(tabs)/__tests__/"),
    );
    expect(offending, `offending spans: ${offending.join("; ")}`).toEqual([]);
  });
});

describe("R04-AC-3: the Local runs. bullet", () => {
  it("R04-AC-3: exists and names --maxWorkers=2, --no-cache, gate.command and CI", () => {
    const text = bullet(section, "Local runs.").text;
    for (const term of ["--maxWorkers=2", "--no-cache", "gate.command", "CI"]) {
      expect(text, `Local runs. does not contain ${term}`).toContain(term);
    }
  });
});

describe("R04-AC-4: the Mutation and pin checks. bullet", () => {
  it("R04-AC-4: exists and names scratch and pin-<n>.patch", () => {
    const text = bullet(section, "Mutation and pin checks.").text;
    for (const term of ["scratch", "pin-<n>.patch"]) {
      expect(text, `Mutation and pin checks. does not contain ${term}`).toContain(term);
    }
  });
});

describe("R04-AC-5: the Spec files: line", () => {
  it("R04-AC-5: lists SPEC.md, docs/graph.yaml, nodes/ and AGENTS.md on the line itself", () => {
    const line = bullet(section, "Spec files:").firstLine;
    expect(codeSpans(line), `spans on the Spec files: line: ${line}`).toEqual([
      "SPEC.md",
      "docs/graph.yaml",
      "nodes/",
      "AGENTS.md",
    ]);
  });
});

describe("R04-AC-6: the Gate command. bullet is unchanged", () => {
  it("R04-AC-6: its first code span equals gate.command and has no --maxWorkers", () => {
    const first = codeSpans(bullet(section, "Gate command.").text)[0];
    expect(first, "Gate command. first span differs from gate.command").toBe(graph.gate.command);
    expect(first).not.toContain("--maxWorkers");
  });
});
