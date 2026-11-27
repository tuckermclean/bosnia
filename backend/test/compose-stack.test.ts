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

// ---------------------------------------------------------------------------------------------
// D07: the single-host Compose stack in compose/ (read without Docker, key or network).
// Files are read lazily inside each test, so a missing file is a failing case, not a crash.
// ---------------------------------------------------------------------------------------------
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { parse as parseYaml } from "yaml";

const composeDir = fileURLToPath(new URL("../../compose/", import.meta.url));
const repoRoot = resolve(composeDir, "..");

function readCompose(file: string): string {
  return readFileSync(resolve(composeDir, file), "utf8");
}

function composeDoc(): any {
  const doc = parseYaml(readCompose("compose.yaml"));
  if (!doc || typeof doc !== "object") throw new Error("compose/compose.yaml is not a mapping");
  return doc;
}

function services(): Record<string, any> {
  const s = composeDoc().services;
  if (!s || typeof s !== "object") throw new Error("compose.yaml has no services");
  return s;
}

function service(name: string): any {
  const svc = services()[name];
  if (!svc) throw new Error(`compose.yaml has no service ${name}`);
  return svc;
}

// environment / build args as a map or a list of KEY=VALUE
function kv(v: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = String(item);
      const i = s.indexOf("=");
      if (i < 0) out[s] = "";
      else out[s.slice(0, i)] = s.slice(i + 1);
    }
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v)) out[k] = val === null || val === undefined ? "" : String(val);
  }
  return out;
}

function buildOf(svc: any): { context: string; dockerfile: string } {
  const b = svc.build;
  if (b === undefined || b === null) throw new Error("service has no build");
  const context = resolve(composeDir, typeof b === "string" ? b : String(b.context ?? "."));
  const df = typeof b === "string" ? "Dockerfile" : String(b.dockerfile ?? "Dockerfile");
  return { context, dockerfile: resolve(context, df) };
}

function dependsOn(svc: any): string[] {
  const d = svc.depends_on;
  if (Array.isArray(d)) return d.map(String);
  if (d && typeof d === "object") return Object.keys(d);
  return [];
}

// "80:80", "443:443/udp", "127.0.0.1:80:80", 80, or { target, published, protocol }
function portPairs(svc: any): { published: string; target: string; protocol: string }[] {
  return (svc.ports ?? []).map((p: any) => {
    if (p && typeof p === "object") {
      return {
        published: String(p.published ?? p.target),
        target: String(p.target),
        protocol: String(p.protocol ?? "tcp"),
      };
    }
    const [specRaw, proto] = String(p).split("/");
    const spec = specRaw ?? "";
    const parts = spec.split(":");
    const target = parts[parts.length - 1];
    const published = parts.length > 1 ? parts[parts.length - 2] : target;
    return { published, target, protocol: proto ?? "tcp" };
  });
}

// a volume entry as { source, target }
function volumeEntries(svc: any): { source: string; target: string }[] {
  return (svc.volumes ?? []).map((v: any) => {
    if (v && typeof v === "object") return { source: String(v.source ?? ""), target: String(v.target ?? "") };
    const parts = String(v).split(":");
    return { source: parts[0] ?? "", target: parts[1] ?? "" };
  });
}

function isNamedVolume(source: string): boolean {
  const top = composeDoc().volumes;
  return (
    !!source &&
    !/^[./~]/.test(source) &&
    top !== null &&
    typeof top === "object" &&
    Object.prototype.hasOwnProperty.call(top, source)
  );
}

function dockerfileStages(text: string): { image: string; name?: string; body: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
  const stages: { image: string; name?: string; body: string }[] = [];
  for (const line of lines) {
    const m = /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i.exec(line);
    if (m) stages.push({ image: m[1] ?? "", name: m[2], body: "" });
    else if (stages.length) stages[stages.length - 1]!.body += line + "\n";
  }
  return stages;
}

describe("D07-AC-1: services and ports", () => {
  it("D07-AC-1: the services are exactly postgres, backend, voice-agent and web", () => {
    expect(Object.keys(services()).sort()).toEqual(["backend", "postgres", "voice-agent", "web"]);
  });

  it("D07-AC-1: only web publishes ports, 80 and 443, and nothing else", () => {
    const svcs = services();
    for (const [name, svc] of Object.entries(svcs)) {
      if (name === "web") continue;
      expect(svc.ports ?? [], `${name} must publish no ports`).toEqual([]);
    }
    const pairs = portPairs(svcs.web);
    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(["80", "443"]).toContain(p.target);
      expect(p.published).toBe(p.target);
      if (p.protocol === "udp") expect(p.target).toBe("443");
      else expect(p.protocol).toBe("tcp");
    }
    const tcp = pairs.filter((p) => p.protocol === "tcp").map((p) => p.target);
    expect(tcp).toContain("80");
    expect(tcp).toContain("443");
  });

  it("D07-AC-1: no service uses network_mode host", () => {
    for (const [name, svc] of Object.entries(services())) {
      expect(svc.network_mode, `${name} network_mode`).not.toBe("host");
    }
  });
});

describe("D07-AC-2: postgres, backend and voice-agent", () => {
  it("D07-AC-2: postgres runs postgres:16 with its data directory on a named volume", () => {
    const pg = service("postgres");
    expect(pg.image).toBe("postgres:16");
    const data = volumeEntries(pg).find((v) => v.target.replace(/\/$/, "") === "/var/lib/postgresql/data");
    expect(data, "a volume mounted at /var/lib/postgresql/data").toBeDefined();
    expect(isNamedVolume(data!.source), `${data?.source} is declared under top-level volumes`).toBe(true);
  });

  it("D07-AC-2: backend builds from backend/Dockerfile with the repository root as its context", () => {
    const b = buildOf(service("backend"));
    expect(b.context).toBe(repoRoot);
    expect(b.dockerfile).toBe(resolve(repoRoot, "backend/Dockerfile"));
    expect(existsSync(b.dockerfile)).toBe(true);
  });

  it("D07-AC-2: backend DATABASE_URL names the host postgres, AUTO_SEED is \"true\", it depends on postgres", () => {
    const be = service("backend");
    const env = kv(be.environment);
    const url = env.DATABASE_URL ?? "";
    expect(url, "DATABASE_URL in backend environment").toBeTruthy();
    const afterAt = url.slice(url.lastIndexOf("@") + 1);
    expect(url).toContain("@");
    expect(afterAt.split(/[:/?]/)[0]).toBe("postgres");
    expect(env.AUTO_SEED).toBe("true");
    expect(dependsOn(be)).toContain("postgres");
  });

  it("D07-AC-2: voice-agent builds from voice-agent/Dockerfile in voice-agent/", () => {
    const b = buildOf(service("voice-agent"));
    expect(b.context).toBe(resolve(repoRoot, "voice-agent"));
    expect(b.dockerfile).toBe(resolve(repoRoot, "voice-agent/Dockerfile"));
    expect(existsSync(b.dockerfile)).toBe(true);
  });
});

describe("D07-AC-3: web service and image", () => {
  it("D07-AC-3: web builds from compose/web.Dockerfile with app/ as context and the public origin argument", () => {
    const web = service("web");
    const b = buildOf(web);
    expect(b.context).toBe(resolve(repoRoot, "app"));
    expect(b.dockerfile).toBe(resolve(composeDir, "web.Dockerfile"));
    expect(existsSync(b.dockerfile)).toBe(true);
    expect(kv(web.build?.args).EXPO_PUBLIC_API_BASE_URL).toBe("https://${DOMAIN}");
  });

  it("D07-AC-3: web mounts the Caddyfile and keeps Caddy's data and config on named volumes", () => {
    const vols = volumeEntries(service("web"));
    const cf = vols.find((v) => v.target === "/etc/caddy/Caddyfile");
    expect(cf, "a mount at /etc/caddy/Caddyfile").toBeDefined();
    expect(resolve(composeDir, cf!.source)).toBe(resolve(composeDir, "Caddyfile"));
    for (const target of ["/data", "/config"]) {
      const v = vols.find((x) => x.target === target);
      expect(v, `a volume at ${target}`).toBeDefined();
      expect(isNamedVolume(v!.source), `${v?.source} is a declared named volume`).toBe(true);
    }
    expect(dependsOn(service("web"))).toContain("backend");
  });

  it("D07-AC-3: web.Dockerfile exports the web build in its first stage and ends on a bare caddy image", () => {
    const stages = dockerfileStages(readCompose("web.Dockerfile"));
    expect(stages.length).toBeGreaterThanOrEqual(2);
    const first = stages[0]!;
    const last = stages[stages.length - 1]!;
    expect(first.body).toMatch(/export:web/);
    expect(last.image).toMatch(/(^|\/)caddy([:@]|$)/);
    const from = [...last.body.matchAll(/--from=(\S+)/g)].map((m) => m[1]);
    expect(from.length).toBeGreaterThan(0);
    for (const f of from) expect([first.name, "0"].filter(Boolean)).toContain(f);
    expect(last.body).not.toMatch(/^\s*RUN\b[^\n]*\b(npm|npx|node)\b/im);
    expect(last.body).not.toMatch(/^\s*(CMD|ENTRYPOINT)\b[^\n]*\b(npm|npx|node)\b/im);
  });
});

function caddyFiles(): { main: string; all: string } {
  const main = readCompose("Caddyfile");
  let all = main;
  const walk = (dir: string) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      const rel = relative(composeDir, p);
      if (rel === "Caddyfile" || rel === "compose.yaml" || /^web\.Dockerfile/.test(rel) || /(^|\/)\.env/.test(rel)) continue;
      all += "\n" + readFileSync(p, "utf8");
    }
  };
  walk(composeDir);
  return { main, all };
}

describe("D07-AC-4: Caddyfile", () => {
  it("D07-AC-4: serves the DOMAIN site and proxies /api/* and /health to backend:3000", () => {
    const { main, all } = caddyFiles();
    expect(main).toMatch(/^\s*\{\$DOMAIN(:[^}]*)?\}[^\n{]*\{/m);
    expect(all).toContain("/api/*");
    expect(all).toMatch(/\/health/);
    expect(all).toMatch(/reverse_proxy\s+[^\n]*backend:3000/);
  });

  it("D07-AC-4: serves the export with a try_files fallback to /index.html", () => {
    const { all } = caddyFiles();
    expect(all).toMatch(/try_files\s+\{path\}\s+\/index\.html/);
    expect(all).toMatch(/^\s*file_server\b/m);
  });

  it("D07-AC-4: basic auth is switched by BASIC_AUTH and leaves /health open", () => {
    const { main, all } = caddyFiles();
    const auth = all.search(/\bbasic_?auth\b/);
    expect(auth, "a basic_auth directive").toBeGreaterThanOrEqual(0);
    expect(main).toMatch(/\{\$BASIC_AUTH(:[^}]*)?\}/);
    const notHealth = /\bnot\b[^\n]*\/health|\bnot\b\s*\{[^}]*\/health/.test(all);
    const healthFirst = (() => {
      const h = all.search(/\bhandle(_path)?\s+\/health/);
      return h >= 0 && h < auth;
    })();
    expect(notHealth || healthFirst, "basic auth excludes /health").toBe(true);
  });
});

describe("D07-AC-5: .env.example settings", () => {
  const envNames = (text: string) => new Set([...text.matchAll(/^\s*#?\s*([A-Za-z_][A-Za-z0-9_]*)=/gm)].map((m) => m[1]));

  it("D07-AC-5: names every variable compose.yaml and the Caddyfile read", () => {
    const example = envNames(readCompose(".env.example"));
    const composeVars = [...readCompose("compose.yaml").matchAll(/(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
    const caddyVars = [...caddyFiles().all.matchAll(/\{\$([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
    expect(composeVars.length).toBeGreaterThan(0);
    expect(caddyVars).toContain("DOMAIN");
    for (const name of new Set([...composeVars, ...caddyVars])) {
      expect(example.has(name), `${name} is named in .env.example`).toBe(true);
    }
  });

  it("D07-AC-5: the JWT secrets are REPLACE_WITH placeholders and no other secret has a value", () => {
    const text = readCompose(".env.example");
    const values = new Map<string, string>();
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
      if (m) values.set(m[1] ?? "", (m[2] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2"));
    }
    for (const k of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
      expect(values.get(k), `${k} value`).toContain("REPLACE_WITH");
    }
    for (const [k, v] of values) {
      if (!/(_KEY|_SECRET|_PASSWORD|_HASH)$|TOKEN/.test(k)) continue;
      if (v === "") continue;
      expect(v, `${k} must be empty or a REPLACE_WITH placeholder`).toContain("REPLACE_WITH");
    }
  });
});
