import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestDb } from "../src/db/client.js";
import { createGroqTranscriber } from "../src/services/groq.js";
import { createLiveKitMinter } from "../src/services/livekit.js";
import { fakeMinter, fakeTranscriber } from "./helpers.js";

// Pins (B15) of imported deps' criteria whose files B15 touches: B04-AC-3,
// B04-AC-4, B10-AC-4, B10-AC-6, B10-AC-7. They pass against today's code.

const groqCalls = vi.hoisted(() => ({ create: vi.fn(), ctorKeys: [] as unknown[] }));
const lk = vi.hoisted(() => ({ events: [] as string[], createRoom: vi.fn(), updateRoomMetadata: vi.fn() }));

vi.mock("groq-sdk", () => {
  class Groq {
    audio = { transcriptions: { create: groqCalls.create } };
    constructor(opts: { apiKey?: string }) {
      groqCalls.ctorKeys.push(opts?.apiKey);
    }
  }
  return {
    default: Groq,
    toFile: async (data: unknown, name: string) => ({ data, name }),
  };
});

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("livekit-server-sdk")>();
  class RoomServiceClient {
    createRoom = lk.createRoom;
    updateRoomMetadata = lk.updateRoomMetadata;
  }
  return { ...actual, RoomServiceClient };
});

describe("B04-AC-3: Groq transcriber", () => {
  it("B04-AC-3: calls whisper-large-v3 with language bs and temperature 0, returns trimmed text", async () => {
    groqCalls.create.mockReset();
    groqCalls.create.mockResolvedValue({ text: "  dobar dan \n" });
    const buf = Buffer.from("audio-bytes");
    const text = await createGroqTranscriber("key-x").transcribe(buf, "clip.m4a");
    expect(text).toBe("dobar dan");
    expect(groqCalls.create).toHaveBeenCalledTimes(1);
    const arg = groqCalls.create.mock.calls[0]![0];
    expect(arg.model).toBe("whisper-large-v3");
    expect(arg.language).toBe("bs");
    expect(arg.temperature).toBe(0);
    expect(arg.file).toBeDefined();
  });
});

describe("B04-AC-4: LiveKit minter", () => {
  const secret = "s".repeat(40);
  beforeEach(() => {
    lk.events.length = 0;
    lk.createRoom.mockReset();
    lk.updateRoomMetadata.mockReset();
    lk.createRoom.mockImplementation(async () => {
      lk.events.push("createRoom");
    });
    lk.updateRoomMetadata.mockImplementation(async () => {
      lk.events.push("updateRoomMetadata");
    });
  });

  it("B04-AC-4: sets room metadata {level, scenario} before the token is returned", async () => {
    const minter = createLiveKitMinter("api-key", secret, "wss://x.livekit.test");
    const p = minter.mint("user-1", "room-1", { level: "A1", scenario: "cafe" });
    const grant = await p;
    expect(lk.events).toEqual(["createRoom"]);
    expect(lk.createRoom).toHaveBeenCalledWith({
      name: "room-1",
      metadata: JSON.stringify({ level: "A1", scenario: "cafe" }),
    });
    expect(grant.roomName).toBe("room-1");
    expect(grant.url).toBe("wss://x.livekit.test");
  });

  it("B04-AC-4: falls back to updateRoomMetadata when createRoom fails", async () => {
    lk.createRoom.mockRejectedValue(new Error("exists"));
    const minter = createLiveKitMinter("api-key", secret, "wss://x.livekit.test");
    const grant = await minter.mint("user-1", "room-2", { level: "B1" });
    expect(lk.updateRoomMetadata).toHaveBeenCalledWith("room-2", JSON.stringify({ level: "B1" }));
    expect(grant.token).toBeTruthy();
  });

  it("B04-AC-4: makes no room call when neither level nor scenario is given", async () => {
    const minter = createLiveKitMinter("api-key", secret, "wss://x.livekit.test");
    await minter.mint("user-1", "room-3");
    await minter.mint("user-1", "room-3", {});
    expect(lk.createRoom).not.toHaveBeenCalled();
    expect(lk.updateRoomMetadata).not.toHaveBeenCalled();
  });

  it("B04-AC-4: token grants join/publish/subscribe for exactly that room with a 1h TTL", async () => {
    const minter = createLiveKitMinter("api-key", secret, "wss://x.livekit.test");
    const { token } = await minter.mint("user-9", "room-4", { scenario: "market" });
    const claims = jwt.verify(token, secret) as jwt.JwtPayload & {
      video?: Record<string, unknown>;
    };
    expect(claims.iss).toBe("api-key");
    expect(claims.sub).toBe("user-9");
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: "room-4",
      canPublish: true,
      canSubscribe: true,
    });
    const start = claims.nbf ?? claims.iat!;
    expect(claims.exp! - start).toBeGreaterThanOrEqual(3590);
    expect(claims.exp! - start).toBeLessThanOrEqual(3610);
  });
});

describe("B10-AC-4: GET /health", () => {
  it("B10-AC-4: answers 200 {ok: true} without authentication", async () => {
    const { db } = await createTestDb();
    const app = buildApp({ db, transcriber: fakeTranscriber(""), minter: fakeMinter() });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});

describe("B10-AC-7: CORS and helmet", () => {
  it("B10-AC-7: echoes any origin and carries helmet headers on every response", async () => {
    const { db } = await createTestDb();
    const app = buildApp({ db, transcriber: fakeTranscriber(""), minter: fakeMinter() });
    const origin = "https://anything.example";
    const cases = [
      { url: "/health", status: 200 },
      { url: "/api/courses", status: 401 },
      { url: "/no-such-route", status: 404 },
    ];
    for (const c of cases) {
      const res = await app.inject({ method: "GET", url: c.url, headers: { origin } });
      expect(res.statusCode, c.url).toBe(c.status);
      expect(res.headers["access-control-allow-origin"], c.url).toBe(origin);
      expect(res.headers["x-content-type-options"], c.url).toBe("nosniff");
      expect(res.headers["x-frame-options"], c.url).toBeDefined();
      expect(res.headers["content-security-policy"], c.url).toBeDefined();
    }
    await app.close();
  });
});

describe("B10-AC-6: server process", () => {
  const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tsx = path.resolve(backendDir, "../node_modules/.bin/tsx");
  let child: ChildProcess | undefined;

  afterEach(() => {
    child?.kill("SIGKILL");
    child = undefined;
  });

  function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
    const base: NodeJS.ProcessEnv = { ...process.env };
    for (const k of ["DATABASE_URL", "AUTO_SEED", "PORT", "PGLITE_PATH", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
      delete base[k];
    }
    return {
      ...base,
      GROQ_API_KEY: "",
      LIVEKIT_URL: "",
      LIVEKIT_API_KEY: "",
      LIVEKIT_API_SECRET: "",
      ...extra,
    };
  }

  function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const srv = createServer();
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const { port } = srv.address() as { port: number };
        srv.close(() => resolve(port));
      });
    });
  }

  async function startServer(extra: Record<string, string>): Promise<number> {
    const port = await freePort();
    child = spawn(tsx, ["src/index.ts"], {
      cwd: backendDir,
      env: childEnv({ PORT: String(port), ...extra }),
      stdio: ["ignore", "ignore", "ignore"],
    });
    let exited = false;
    child.once("exit", () => {
      exited = true;
    });
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (exited) throw new Error("server exited before listening");
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) return port;
      } catch {
        // not listening yet
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error("server did not start in time");
  }

  async function coursesCount(port: number): Promise<number> {
    const base = `http://127.0.0.1:${port}`;
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "pin@example.com", password: "hunter2222" }),
    });
    expect(reg.status).toBe(200);
    const { accessToken } = (await reg.json()) as { accessToken: string };
    const res = await fetch(`${base}/api/courses`, { headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.status).toBe(200);
    return ((await res.json()) as { courses: unknown[] }).courses.length;
  }

  it("B10-AC-6: with a set DATABASE_URL and dev secrets it exits 1 on the boot guard before opening the DB", async () => {
    let stderr = "";
    child = spawn(tsx, ["src/index.ts"], {
      cwd: backendDir,
      env: childEnv({
        DATABASE_URL: "postgres://u:p@127.0.0.1:1/x",
        JWT_ACCESS_SECRET: "dev-access-secret-change-me",
        JWT_REFRESH_SECRET: "dev-refresh-secret-change-me",
        PORT: "0",
      }),
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr!.on("data", (d) => {
      stderr += String(d);
    });
    const code = await new Promise<number | null>((resolve) => child!.once("exit", (c) => resolve(c)));
    expect(code).toBe(1);
    expect(stderr).toContain("Refusing to boot");
  }, 60_000);

  it("B10-AC-6: with DATABASE_URL unset it listens and answers GET /health", async () => {
    const port = await startServer({ AUTO_SEED: "false" });
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  }, 90_000);

  it.runIf(process.platform === "linux")("B10-AC-6: listens on 0.0.0.0 (answers on another loopback address)", async () => {
    const port = await startServer({ AUTO_SEED: "false" });
    const res = await fetch(`http://127.0.0.2:${port}/health`);
    expect(res.status).toBe(200);
  }, 90_000);

  it("B10-AC-6: with AUTO_SEED unset and a local DB it auto-seeds the course", async () => {
    const port = await startServer({});
    expect(await coursesCount(port)).toBeGreaterThan(0);
  }, 90_000);

  it("B10-AC-6: with AUTO_SEED=false it does not seed (empty course list)", async () => {
    const port = await startServer({ AUTO_SEED: "false" });
    expect(await coursesCount(port)).toBe(0);
  }, 90_000);
});
