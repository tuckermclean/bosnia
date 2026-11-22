import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import FormData from "form-data";
import * as appModule from "../src/app.js";
import { buildApp } from "../src/app.js";
import { createTestDb, type DbHandle } from "../src/db/client.js";
import { pronunciationAttempts, tutorSessions } from "../src/db/schema.js";
import { createGroqTranscriber, type Transcriber } from "../src/services/groq.js";
import { createLiveKitMinter, type RoomTokenMinter } from "../src/services/livekit.js";
import { fakeTranscriber, fakeMinter } from "./helpers.js";

// No network: the real SDKs are replaced by recorders, so a call that reaches
// Groq or LiveKit is counted (and would still never leave the process).
const sdk = vi.hoisted(() => ({ groqCalls: 0, livekitCalls: 0 }));

vi.mock("groq-sdk", () => ({
  default: class FakeGroq {
    audio = {
      transcriptions: {
        create: async () => {
          sdk.groqCalls++;
          return { text: " recorded " };
        },
      },
    };
  },
  toFile: async (bytes: unknown) => bytes,
}));

vi.mock("livekit-server-sdk", () => ({
  RoomServiceClient: class FakeRoomServiceClient {
    async createRoom() {
      sdk.livekitCalls++;
      return {};
    }
    async updateRoomMetadata() {
      sdk.livekitCalls++;
      return {};
    }
  },
  AccessToken: class FakeAccessToken {
    addGrant() {
      sdk.livekitCalls++;
    }
    async toJwt() {
      sdk.livekitCalls++;
      return "recorded-jwt";
    }
  },
}));

type LogLine = { level: number; msg?: string; [key: string]: unknown };

const PASSWORD = "Sup3r-secret-pw-xyz";
const MINTED_TOKEN = "sentinel-minted-livekit-token";
const SENTINEL_URL = "wss://sentinel-host.example.test";
const SENTINEL_KEY = "sentinel-api-key-value";
const SENTINEL_SECRET = "sentinel-api-secret-value";

/** Fails per case, not at load, until src/unavailable.ts exists. */
async function loadUnavailable() {
  return await import("../src/unavailable.js");
}

describe("missing keys answer 503, the server log names them", () => {
  let dbHandle: DbHandle;
  let lines: LogLine[];
  let apps: FastifyInstance[];

  beforeEach(async () => {
    dbHandle = await createTestDb();
    lines = [];
    apps = [];
  });

  afterEach(async () => {
    for (const a of apps) await a.close();
    await dbHandle.close();
    vi.restoreAllMocks();
    sdk.groqCalls = 0;
    sdk.livekitCalls = 0;
  });

  /** SERVER_LOGGER (read off the module namespace) plus a stream that collects each line. */
  function testLogger() {
    const stream = {
      write(chunk: string) {
        for (const text of String(chunk).split("\n")) {
          if (text.trim() !== "") lines.push(JSON.parse(text) as LogLine);
        }
      },
    };
    return { ...appModule.SERVER_LOGGER, stream };
  }

  function makeApp(transcriber: Transcriber, minter: RoomTokenMinter): FastifyInstance {
    const app = buildApp({ db: dbHandle.db, transcriber, minter }, { logger: testLogger() });
    apps.push(app);
    return app;
  }

  async function register(app: FastifyInstance, email = "k@example.com") {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    return res.json() as { accessToken: string; refreshToken: string };
  }

  async function upload(app: FastifyInstance, accessToken: string) {
    const form = new FormData();
    form.append("targetPhrase", "Dobar dan");
    form.append("audio", Buffer.from("fake-wav-bytes"), { filename: "clip.wav", contentType: "audio/wav" });
    return await app.inject({
      method: "POST",
      url: "/api/pronunciation",
      headers: { authorization: `Bearer ${accessToken}`, ...form.getHeaders() },
      payload: form.getBuffer(),
    });
  }

  async function startSession(app: FastifyInstance, accessToken: string, payload: object = {}) {
    return await app.inject({
      method: "POST",
      url: "/api/tutor/session",
      headers: { authorization: `Bearer ${accessToken}` },
      payload,
    });
  }

  const errorLines = () => lines.filter((l) => l.level === 50);

  describe("Pronunciation", () => {
    for (const [label, key] of [
      ["an empty key", ""],
      ["a key of only spaces", "   "],
    ] as const) {
      it(`B15-AC-1, B15-AC-3: ${label} answers 503, saves no attempt, logs one error line naming GROQ_API_KEY`, async () => {
        const app = makeApp(createGroqTranscriber(key), fakeMinter());
        const { accessToken } = await register(app);
        lines.length = 0;

        const res = await upload(app, accessToken);

        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({ error: "pronunciation is unavailable" });
        expect(res.body).not.toContain("GROQ_API_KEY");
        expect(await dbHandle.db.select().from(pronunciationAttempts)).toHaveLength(0);

        expect(lines).toHaveLength(1);
        expect(errorLines()).toHaveLength(1);
        expect(errorLines()[0]?.msg).toContain("GROQ_API_KEY");
      });
    }
  });

  describe("Tutor", () => {
    for (const [label, payload] of [
      ["without a level", {}],
      ["with a level", { level: "A2" }],
    ] as const) {
      it(`B15-AC-2, B15-AC-3: ${label} answers 503, saves no session, logs one error line naming the three settings`, async () => {
        const app = makeApp(fakeTranscriber(""), createLiveKitMinter("", "", ""));
        const { accessToken } = await register(app);
        lines.length = 0;

        const res = await startSession(app, accessToken, payload);

        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({ error: "voice tutor is unavailable" });
        expect(res.body).not.toContain("LIVEKIT_");
        expect(await dbHandle.db.select().from(tutorSessions)).toHaveLength(0);

        expect(lines).toHaveLength(1);
        expect(errorLines()).toHaveLength(1);
        const msg = errorLines()[0]?.msg ?? "";
        expect(msg).toContain("LIVEKIT_URL");
        expect(msg).toContain("LIVEKIT_API_KEY");
        expect(msg).toContain("LIVEKIT_API_SECRET");
      });
    }

    it("B15-AC-3: with the URL and key set and only the secret empty, the line names only LIVEKIT_API_SECRET", async () => {
      const app = makeApp(fakeTranscriber(""), createLiveKitMinter(SENTINEL_KEY, "", SENTINEL_URL));
      const { accessToken } = await register(app);
      lines.length = 0;

      const res = await startSession(app, accessToken, { level: "B1" });

      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ error: "voice tutor is unavailable" });
      expect(res.body).not.toContain("LIVEKIT_");
      expect(await dbHandle.db.select().from(tutorSessions)).toHaveLength(0);

      expect(lines).toHaveLength(1);
      expect(errorLines()).toHaveLength(1);
      const line = errorLines()[0]!;
      expect(line.msg).toContain("LIVEKIT_API_SECRET");
      expect(line.msg).not.toContain("LIVEKIT_URL");
      expect(line.msg).not.toContain("LIVEKIT_API_KEY");
      const text = JSON.stringify(line);
      expect(text).not.toContain(SENTINEL_URL);
      expect(text).not.toContain(SENTINEL_KEY);
    });
  });

  describe("The adapters", () => {
    it("B15-AC-4: the Groq transcriber builds without a key and rejects a call with a FeatureUnavailableError, before any Groq call", async () => {
      const { FeatureUnavailableError } = await loadUnavailable();
      for (const key of ["", "   "]) {
        let transcriber: Transcriber | undefined;
        expect(() => {
          transcriber = createGroqTranscriber(key);
        }).not.toThrow();
        const err = await transcriber!.transcribe(Buffer.from("x"), "clip.wav").catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FeatureUnavailableError);
        expect((err as InstanceType<typeof FeatureUnavailableError>).feature).toBe("pronunciation");
        expect((err as InstanceType<typeof FeatureUnavailableError>).missingKeys).toEqual(["GROQ_API_KEY"]);
      }
      expect(sdk.groqCalls).toBe(0);
    });

    it("B15-AC-4: the LiveKit minter builds without settings and rejects a call with a FeatureUnavailableError, before any LiveKit call", async () => {
      const { FeatureUnavailableError } = await loadUnavailable();
      let minter: RoomTokenMinter | undefined;
      expect(() => {
        minter = createLiveKitMinter("", "", "");
      }).not.toThrow();
      for (const metadata of [undefined, { level: "A2", scenario: "cafe" }]) {
        const err = await minter!.mint("user-1", "room-1", metadata).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(FeatureUnavailableError);
        expect((err as InstanceType<typeof FeatureUnavailableError>).feature).toBe("voice tutor");
        expect((err as InstanceType<typeof FeatureUnavailableError>).missingKeys).toEqual([
          "LIVEKIT_URL",
          "LIVEKIT_API_KEY",
          "LIVEKIT_API_SECRET",
        ]);
      }
      expect(sdk.livekitCalls).toBe(0);
    });

    it("B15-AC-4: the LiveKit minter names only the missing settings", async () => {
      const { FeatureUnavailableError } = await loadUnavailable();
      const minter = createLiveKitMinter(SENTINEL_KEY, "", SENTINEL_URL);
      const err = await minter.mint("user-1", "room-1", { level: "A2" }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(FeatureUnavailableError);
      expect((err as InstanceType<typeof FeatureUnavailableError>).missingKeys).toEqual(["LIVEKIT_API_SECRET"]);
      expect(sdk.livekitCalls).toBe(0);
    });
  });

  describe("Other errors", () => {
    it("B15-AC-5: any other error is answered 500 and its cause is logged at level error", async () => {
      const exploding: Transcriber = {
        async transcribe() {
          throw new Error("transcriber exploded");
        },
      };
      const app = makeApp(exploding, fakeMinter());
      const { accessToken } = await register(app);
      lines.length = 0;

      const res = await upload(app, accessToken);

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: "Internal server error" });
      expect(res.body).not.toContain("transcriber exploded");
      const carrying = errorLines().filter((l) => JSON.stringify(l).includes("transcriber exploded"));
      expect(carrying.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Request noise", () => {
    it("B15-AC-6: SERVER_LOGGER is level info, and a successful health, register and login write no log line", async () => {
      expect(appModule.SERVER_LOGGER).toEqual({ level: "info" });

      const app = makeApp(fakeTranscriber(""), fakeMinter());
      // Proof the collecting stream is live: this probe must be the only line.
      app.log.info("probe");

      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      await register(app);
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "k@example.com", password: PASSWORD },
      });
      expect(login.statusCode).toBe(200);

      expect(lines.map((l) => l.msg)).toEqual(["probe"]);
    });
  });

  describe("No secrets", () => {
    it("B15-AC-7: no line holds a password, a token, a minted token or a setting value", async () => {
      const app = makeApp(fakeTranscriber(""), fakeMinter({ token: MINTED_TOKEN }));
      const registered = await register(app);
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "k@example.com", password: PASSWORD },
      });
      const loggedIn = login.json() as { accessToken: string; refreshToken: string };
      const refresh = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: registered.refreshToken },
      });
      expect(refresh.statusCode).toBe(200);
      const refreshed = refresh.json() as { accessToken: string; refreshToken: string };
      const minted = await startSession(app, registered.accessToken, { level: "A2" });
      expect(minted.statusCode).toBe(200);
      expect(minted.json().token).toBe(MINTED_TOKEN);

      const keyless = makeApp(createGroqTranscriber(""), createLiveKitMinter(SENTINEL_KEY, "", SENTINEL_URL));
      expect((await upload(keyless, registered.accessToken)).statusCode).toBe(503);
      expect((await startSession(keyless, registered.accessToken)).statusCode).toBe(503);
      const unset = makeApp(createGroqTranscriber(""), createLiveKitMinter("", "", ""));
      expect((await upload(unset, registered.accessToken)).statusCode).toBe(503);
      expect((await startSession(unset, registered.accessToken, { level: "B2" })).statusCode).toBe(503);
      // The setting values themselves, set only to be absent from the log.
      const withSecret = createLiveKitMinter(SENTINEL_KEY, SENTINEL_SECRET, "");
      const sentinelApp = makeApp(fakeTranscriber(""), withSecret);
      expect((await startSession(sentinelApp, registered.accessToken)).statusCode).toBe(503);

      expect(errorLines().length).toBeGreaterThanOrEqual(4);
      const text = lines.map((l) => JSON.stringify(l)).join("\n");
      for (const secret of [
        PASSWORD,
        registered.accessToken,
        registered.refreshToken,
        loggedIn.accessToken,
        loggedIn.refreshToken,
        refreshed.accessToken,
        refreshed.refreshToken,
        MINTED_TOKEN,
        SENTINEL_URL,
        SENTINEL_KEY,
        SENTINEL_SECRET,
      ]) {
        expect(text).not.toContain(secret);
      }
    });
  });

  describe("Quiet by default", () => {
    it("B15-AC-8: buildApp(deps) without options writes nothing to stdout", async () => {
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString());
      };
      // Pino writes through the fd with fs.writeSync/fs.write, not process.stdout.write.
      vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
        capture(chunk);
        return true;
      }) as typeof process.stdout.write);
      const realWriteSync = fs.writeSync;
      vi.spyOn(fs, "writeSync").mockImplementation(((fd: number, data: unknown, ...rest: unknown[]) => {
        if (fd === 1) {
          capture(data);
          return 0;
        }
        return (realWriteSync as (...a: unknown[]) => number)(fd, data, ...rest);
      }) as typeof fs.writeSync);

      const exploding: Transcriber = {
        async transcribe() {
          throw new Error("quiet explosion");
        },
      };
      const app = buildApp({ db: dbHandle.db, transcriber: exploding, minter: createLiveKitMinter("", "", "") });
      apps.push(app);
      const { accessToken } = await register(app);
      expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
      // Statuses are B15-AC-1/2/5's business; here only what the app writes counts.
      await upload(app, accessToken);
      await startSession(app, accessToken);

      // Vitest's own reporter may write too; the app's lines are pino JSON with a level.
      expect(written.filter((text) => /"level"\s*:/.test(text))).toEqual([]);
      expect(written.filter((text) => text.includes("quiet explosion"))).toEqual([]);
    });
  });
});
