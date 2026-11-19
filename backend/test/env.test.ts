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

// ---- B12: the guard also refuses REPLACE_WITH placeholders and short secrets ----

const ACCESS = "JWT_ACCESS_SECRET";
const REFRESH = "JWT_REFRESH_SECRET";
const REAL_64_A = "Wn4Qz8Lv2Hr6Tk0Bx3Ys7Dp1Gc5Mj9FaUe2Ro6Vi8Nt4Kh0Sb3Zl7Xq1Cd5Pw9Y".padEnd(64, "7");
const REAL_64_B = "Jd6Ph2Xs9Gm4Vb8Rt1Nk5Zc3Lw7Qy0FeAu4Ho8Ti2Sn6Bx9Kv1Mr5Dl3Cg7Wz0P".padEnd(64, "7");
const PLACEHOLDER_LONG_A = "REPLACE_WITH_pQ7xT2vK9mZ4cR8bN3hLw6YdS1fG5jU0aE";
const PLACEHOLDER_LONG_B = "REPLACE_WITH_Hc3Vn8Kd5Zt1Rm6Xw9Lb2Qs4Yf7Pg0JeUa";
const PLACEHOLDER_SHORT = "REPLACE_WITH_x9Q";
const SHORT_31 = "Hq3Zp8Vw5Tn2Lx7Rb4Kd9Sm6Cj1Yf0u";
const EXACT_32 = "Gb5Wk1Nz8Rt3Xc7Lq2Vd9Hm4Sp6Jy0Fa";
const SHORT_31_REFRESH = "Tm9Lc4Xq1Wb7Zr3Kd8Vn5Hp2Sy6Jg0e";

function realSecretsLength(): void {
  expect(REAL_64_A.length).toBe(64);
  expect(REAL_64_B.length).toBe(64);
  expect(SHORT_31.length).toBe(31);
  expect(SHORT_31_REFRESH.length).toBe(31);
  expect(EXACT_32.length).toBe(32);
  expect(PLACEHOLDER_LONG_A.length).toBeGreaterThanOrEqual(32);
  expect(PLACEHOLDER_LONG_B.length).toBeGreaterThanOrEqual(32);
}

async function guardWith(access: string | undefined, refresh: string | undefined, db = PG) {
  return guardMessage(await loadEnv({ DATABASE_URL: db, JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh }));
}

describe("B12-AC-1: placeholder secrets are refused", () => {
  it("B12-AC-1: fixture lengths", () => realSecretsLength());
  it("B12-AC-1: REPLACE_WITH access secret (>= 32 chars) names access only", async () => {
    const msg = await guardWith(PLACEHOLDER_LONG_A, REAL_64_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).not.toContain(REFRESH);
    expect(msg).not.toContain(PLACEHOLDER_LONG_A);
  });
  it("B12-AC-1: REPLACE_WITH refresh secret (>= 32 chars) names refresh only", async () => {
    const msg = await guardWith(REAL_64_A, PLACEHOLDER_LONG_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(ACCESS);
    expect(msg).not.toContain(PLACEHOLDER_LONG_B);
  });
  it("B12-AC-1: both REPLACE_WITH secrets name both", async () => {
    const msg = await guardWith(PLACEHOLDER_LONG_A, PLACEHOLDER_LONG_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(PLACEHOLDER_LONG_A);
    expect(msg).not.toContain(PLACEHOLDER_LONG_B);
  });
  it("B12-AC-1: a short REPLACE_WITH value is refused whatever its length", async () => {
    const msg = await guardWith(PLACEHOLDER_SHORT, REAL_64_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).not.toContain(PLACEHOLDER_SHORT);
  });
  it("B12-AC-1: REPLACE_WITH inside an otherwise long secret is refused", async () => {
    const value = "Zk3Vq8Lm5Tn2Xr7Bd4Hs9Yc1Pw6REPLACE_WITHJg0Fa";
    const msg = await guardWith(REAL_64_A, value);
    expect(msg).not.toBeNull();
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(value);
  });
});

describe("B12-AC-2: secrets shorter than 32 characters are refused", () => {
  it("B12-AC-2: a 31-character access secret throws and names access", async () => {
    const msg = await guardWith(SHORT_31, REAL_64_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).not.toContain(REFRESH);
  });
  it("B12-AC-2: a 31-character refresh secret throws and names refresh", async () => {
    const msg = await guardWith(REAL_64_A, SHORT_31_REFRESH);
    expect(msg).not.toBeNull();
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(ACCESS);
  });
  it("B12-AC-2: an access secret of exactly 32 characters is accepted", async () => {
    expect(await guardWith(EXACT_32, REAL_64_B)).toBeNull();
  });
  it("B12-AC-2: a refresh secret of exactly 32 characters is accepted", async () => {
    expect(await guardWith(REAL_64_A, EXACT_32)).toBeNull();
  });
});

describe("B12-AC-3: dev-, unset and real secrets", () => {
  it("B12-AC-3: a dev- access secret is refused naming access", async () => {
    const msg = await guardWith(DEV_ACCESS, REAL_64_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
  });
  it("B12-AC-3: a dev- refresh secret is refused naming refresh", async () => {
    const msg = await guardWith(REAL_64_A, DEV_REFRESH);
    expect(msg).not.toBeNull();
    expect(msg).toContain(REFRESH);
  });
  it("B12-AC-3: an unset access secret is refused naming access", async () => {
    const msg = await guardWith(undefined, REAL_64_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
  });
  it("B12-AC-3: an unset refresh secret is refused naming refresh", async () => {
    const msg = await guardWith(REAL_64_A, undefined);
    expect(msg).not.toBeNull();
    expect(msg).toContain(REFRESH);
  });
  it("B12-AC-3: two real 64-character secrets pass", async () => {
    realSecretsLength();
    expect(await guardWith(REAL_64_A, REAL_64_B)).toBeNull();
  });
});

describe("B12-AC-4: the error never contains a secret's value", () => {
  const cases: Array<[string, string]> = [
    ["a long placeholder", PLACEHOLDER_LONG_A],
    ["a short placeholder", PLACEHOLDER_SHORT],
    ["a 31-character secret", SHORT_31],
    ["a dev- secret", "dev-Rk4Zp9Vq2Lm7Xt1Bn6Hc3"],
  ];
  for (const [label, value] of cases) {
    it(`B12-AC-4: ${label} as access secret is not echoed`, async () => {
      const msg = await guardWith(value, REAL_64_B);
      expect(msg).not.toBeNull();
      expect(msg).toContain(ACCESS);
      expect(msg).not.toContain(value);
    });
    it(`B12-AC-4: ${label} as refresh secret is not echoed`, async () => {
      const msg = await guardWith(REAL_64_A, value);
      expect(msg).not.toBeNull();
      expect(msg).toContain(REFRESH);
      expect(msg).not.toContain(value);
    });
  }
  it("B12-AC-4: neither value of two refused secrets is echoed", async () => {
    const msg = await guardWith(SHORT_31, PLACEHOLDER_LONG_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(SHORT_31);
    expect(msg).not.toContain(PLACEHOLDER_LONG_B);
  });
});

const TEMPLATE = readFileSync(new URL("../../deploy/backend-secret.example.yaml", import.meta.url), "utf8");

function templateValue(key: string): string {
  const m = new RegExp(`^\\s*${key}:\\s*"([^"]*)"`, "m").exec(TEMPLATE);
  expect(m, `${key} line in the template`).not.toBeNull();
  return m![1]!;
}

describe("B12-AC-5: the template's own JWT values are refused", () => {
  it("B12-AC-5: the template's access value is refused naming access, not echoed", async () => {
    const value = templateValue(ACCESS);
    expect(value.length).toBeGreaterThan(0);
    const msg = await guardWith(value, REAL_64_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).not.toContain(REFRESH);
    expect(msg).not.toContain(value);
  });
  it("B12-AC-5: the template's refresh value is refused naming refresh, not echoed", async () => {
    const value = templateValue(REFRESH);
    expect(value.length).toBeGreaterThan(0);
    const msg = await guardWith(REAL_64_A, value);
    expect(msg).not.toBeNull();
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(ACCESS);
    expect(msg).not.toContain(value);
  });
});

describe("B12-AC-6: local mode never throws", () => {
  const refused: Array<[string, string | undefined]> = [
    ["a long placeholder", PLACEHOLDER_LONG_A],
    ["a short placeholder", PLACEHOLDER_SHORT],
    ["a 31-character secret", SHORT_31],
    ["a dev- secret", DEV_ACCESS],
    ["an unset secret", undefined],
    ["the template's access value", templateValue(ACCESS)],
    ["the template's refresh value", templateValue(REFRESH)],
  ];
  for (const [label, value] of refused) {
    it(`B12-AC-6: local mode with ${label} in both variables does not throw`, async () => {
      const mod = await loadEnv({ DATABASE_URL: "", JWT_ACCESS_SECRET: value, JWT_REFRESH_SECRET: value });
      expect(() => mod.assertProductionSecretsAreSafe()).not.toThrow();
    });
  }
  it("B12-AC-6: whitespace-only DATABASE_URL with a placeholder does not throw", async () => {
    const mod = await loadEnv({
      DATABASE_URL: "  ",
      JWT_ACCESS_SECRET: PLACEHOLDER_LONG_A,
      JWT_REFRESH_SECRET: SHORT_31,
    });
    expect(() => mod.assertProductionSecretsAreSafe()).not.toThrow();
  });
});

// Note: the "unset" cases above (vi.stubEnv(name, undefined)) rely on there being
// no developer .env that sets the JWT secrets, because process.loadEnvFile fills
// an unset variable. CI has no such file.

describe("B12-AC-3: a long dev- secret is refused for its prefix", () => {
  const LONG_DEV_A = "dev-Xk7Qp2Vn9Lz4Rt8Bm3Hc6Ws1Yd5Jf0GaUe2Ro6Vi8Nt4Kh0Sb3Zl7Xq1Cd5Pw9Y";
  const LONG_DEV_B = "dev-Mb3Tz8Kc5Wq1Vn6Rx9Ld2Hs7Yp4Gj0FeAu4Ho8Ti2Sn6Bx9Kv1Mr5Dl3Cg7Wz0P";
  const lengths = () => {
    expect(LONG_DEV_A.length).toBeGreaterThanOrEqual(60);
    expect(LONG_DEV_B.length).toBeGreaterThanOrEqual(60);
    expect(LONG_DEV_A).not.toContain("REPLACE_WITH");
    expect(LONG_DEV_B).not.toContain("REPLACE_WITH");
  };

  it("B12-AC-3: a long dev- access secret is refused, naming access only, not echoed", async () => {
    lengths();
    const msg = await guardWith(LONG_DEV_A, REAL_64_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).not.toContain(REFRESH);
    expect(msg).not.toContain(LONG_DEV_A);
  });
  it("B12-AC-3: a long dev- refresh secret is refused, naming refresh only, not echoed", async () => {
    lengths();
    const msg = await guardWith(REAL_64_A, LONG_DEV_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(ACCESS);
    expect(msg).not.toContain(LONG_DEV_B);
  });
  it("B12-AC-3: two long dev- secrets name both, neither echoed", async () => {
    lengths();
    const msg = await guardWith(LONG_DEV_A, LONG_DEV_B);
    expect(msg).not.toBeNull();
    expect(msg).toContain(ACCESS);
    expect(msg).toContain(REFRESH);
    expect(msg).not.toContain(LONG_DEV_A);
    expect(msg).not.toContain(LONG_DEV_B);
  });
  it("B12-AC-3: local mode with long dev- secrets in both does not throw", async () => {
    lengths();
    const mod = await loadEnv({ DATABASE_URL: "", JWT_ACCESS_SECRET: LONG_DEV_A, JWT_REFRESH_SECRET: LONG_DEV_B });
    expect(() => mod.assertProductionSecretsAreSafe()).not.toThrow();
  });
});
