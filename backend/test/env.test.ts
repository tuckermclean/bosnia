import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts parses process.env once, at import. Each case stubs every variable the
// parse/guard reads (so a developer's .env changes nothing: process.loadEnvFile
// never overwrites a set variable), resets the module cache and imports afresh.

type Vars = Record<string, string | undefined>;

const DEV_ACCESS = "dev-access-secret-change-me";
const DEV_REFRESH = "dev-refresh-secret-change-me";
const REAL_A = "q8Zr3Vn7Lk2Xw9Pd4Tb6Hs1Jc5Mf0Ga".repeat(2);
const REAL_B = "Yt2Kd7Wm4Rb9Nx1Cz6Lq3Vh8Sp5Ge0J".repeat(2);

async function loadEnv(vars: Vars) {
  const base: Vars = {
    DATABASE_URL: "",
    JWT_ACCESS_SECRET: DEV_ACCESS,
    JWT_REFRESH_SECRET: DEV_REFRESH,
    AUTO_SEED: undefined,
    PORT: undefined,
  };
  for (const [k, v] of Object.entries({ ...base, ...vars })) vi.stubEnv(k, v);
  vi.resetModules();
  return import("../src/env.js");
}

function guardMessage(mod: Awaited<ReturnType<typeof loadEnv>>): string | null {
  try {
    mod.assertProductionSecretsAreSafe();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const PG = "postgres://user:pw@db.example.invalid:5432/app";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("pin B02-AC-2: isLocalDb is true exactly when DATABASE_URL is blank", () => {
  it("B02-AC-2: empty DATABASE_URL is local", async () => {
    expect((await loadEnv({ DATABASE_URL: "" })).isLocalDb).toBe(true);
  });
  it("B02-AC-2: whitespace-only DATABASE_URL is local", async () => {
    expect((await loadEnv({ DATABASE_URL: "   \t " })).isLocalDb).toBe(true);
  });
  it("B02-AC-2: a postgres URL is not local", async () => {
    expect((await loadEnv({ DATABASE_URL: PG })).isLocalDb).toBe(false);
  });
});

describe("pin B02-AC-3: production secret guard refuses dev- secrets", () => {
  it("B02-AC-3: dev- access secret only names access, not refresh", async () => {
    const msg = guardMessage(
      await loadEnv({ DATABASE_URL: PG, JWT_ACCESS_SECRET: DEV_ACCESS, JWT_REFRESH_SECRET: REAL_B }),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("JWT_ACCESS_SECRET");
    expect(msg).not.toContain("JWT_REFRESH_SECRET");
  });
  it("B02-AC-3: dev- refresh secret only names refresh, not access", async () => {
    const msg = guardMessage(
      await loadEnv({ DATABASE_URL: PG, JWT_ACCESS_SECRET: REAL_A, JWT_REFRESH_SECRET: DEV_REFRESH }),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("JWT_REFRESH_SECRET");
    expect(msg).not.toContain("JWT_ACCESS_SECRET");
  });
  it("B02-AC-3: both dev- secrets name both", async () => {
    const msg = guardMessage(
      await loadEnv({ DATABASE_URL: PG, JWT_ACCESS_SECRET: "dev-a", JWT_REFRESH_SECRET: "dev-b" }),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("JWT_ACCESS_SECRET");
    expect(msg).toContain("JWT_REFRESH_SECRET");
  });
  it("B02-AC-3: both unset (dev- defaults) name both", async () => {
    const msg = guardMessage(
      await loadEnv({ DATABASE_URL: PG, JWT_ACCESS_SECRET: undefined, JWT_REFRESH_SECRET: undefined }),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("JWT_ACCESS_SECRET");
    expect(msg).toContain("JWT_REFRESH_SECRET");
  });
  it("B02-AC-3: local mode with dev- secrets never throws", async () => {
    const mod = await loadEnv({ DATABASE_URL: "", JWT_ACCESS_SECRET: "dev-a", JWT_REFRESH_SECRET: "dev-b" });
    expect(() => mod.assertProductionSecretsAreSafe()).not.toThrow();
  });
  it("B02-AC-3: local mode with unset secrets never throws", async () => {
    const mod = await loadEnv({
      DATABASE_URL: "  ",
      JWT_ACCESS_SECRET: undefined,
      JWT_REFRESH_SECRET: undefined,
    });
    expect(() => mod.assertProductionSecretsAreSafe()).not.toThrow();
  });
});

describe("pin B02-AC-4: AUTO_SEED and PORT parsing", () => {
  it("B02-AC-4: AUTO_SEED 'true' loads", async () => {
    expect((await loadEnv({ AUTO_SEED: "true" })).env.AUTO_SEED).toBe("true");
  });
  it("B02-AC-4: AUTO_SEED 'false' loads", async () => {
    expect((await loadEnv({ AUTO_SEED: "false" })).env.AUTO_SEED).toBe("false");
  });
  it("B02-AC-4: AUTO_SEED unset loads", async () => {
    expect((await loadEnv({ AUTO_SEED: undefined })).env.AUTO_SEED).toBeUndefined();
  });
  it("B02-AC-4: AUTO_SEED with another value throws at import", async () => {
    await expect(loadEnv({ AUTO_SEED: "yes" })).rejects.toThrow();
  });
  it("B02-AC-4: PORT defaults to 3000 when unset", async () => {
    expect((await loadEnv({ PORT: undefined })).env.PORT).toBe(3000);
  });
});

const ENV_EXAMPLE = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
const ENV_SRC = readFileSync(new URL("../src/env.ts", import.meta.url), "utf8");

function exampleAssignments(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of ENV_EXAMPLE.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m) out.push([m[1]!, (m[2] ?? "").trim()]);
  }
  return out;
}

function schemaKeys(): string[] {
  const start = ENV_SRC.indexOf("z.object({");
  const end = ENV_SRC.indexOf("\n});", start);
  const body = ENV_SRC.slice(start, end);
  return [...body.matchAll(/^ {2}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]!);
}

describe("pin R02-AC-3: .env.example holds no secret value", () => {
  it("R02-AC-3: every value is blank except PORT=3000 and the dev- JWT secrets", () => {
    const assignments = exampleAssignments();
    expect(assignments.length).toBeGreaterThan(0);
    for (const [key, value] of assignments) {
      if (key === "PORT") expect(value, key).toBe("3000");
      else if (key === "JWT_ACCESS_SECRET" || key === "JWT_REFRESH_SECRET")
        expect(value.startsWith("dev-"), key).toBe(true);
      else expect(value, key).toBe("");
    }
  });
  it("R02-AC-3: both JWT secrets are present", () => {
    const keys = exampleAssignments().map(([k]) => k);
    expect(keys).toContain("JWT_ACCESS_SECRET");
    expect(keys).toContain("JWT_REFRESH_SECRET");
  });
});

describe("pin R02-AC-4: .env.example names every setting env.ts reads", () => {
  it("R02-AC-4: the schema keys were found in env.ts", () => {
    const keys = schemaKeys();
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("PORT");
  });
  it("R02-AC-4: every schema key other than AUTO_SEED has a KEY= line", () => {
    const named = new Set(exampleAssignments().map(([k]) => k));
    const missing = schemaKeys().filter((k) => k !== "AUTO_SEED" && !named.has(k));
    expect(missing).toEqual([]);
  });
});
