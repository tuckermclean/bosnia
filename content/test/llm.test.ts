import { describe, it, expect } from "vitest";
import { MockProvider, stripCodeFence, generateJSON } from "../src/llm.js";

describe("stripCodeFence", () => {
  it("strips ```json fences", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("strips plain ``` fences", () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("leaves unfenced text alone", () => {
    expect(stripCodeFence('{"a":1}')).toBe('{"a":1}');
  });
});

describe("MockProvider", () => {
  it("returns the matching canned response for a prompt substring", async () => {
    const provider = new MockProvider().when("hello", "world");
    expect(await provider.generate("say hello please")).toBe("world");
  });

  it("falls back to the default responder when nothing matches", async () => {
    const provider = new MockProvider(() => "fallback");
    expect(await provider.generate("anything")).toBe("fallback");
  });

  it("records every call it receives", async () => {
    const provider = new MockProvider();
    await provider.generate("one");
    await provider.generate("two", { json: true });
    expect(provider.calls.map((c) => c.prompt)).toEqual(["one", "two"]);
  });

  it("never hits the network — is fully offline/deterministic", async () => {
    const provider = new MockProvider().when("x", '{"ok":true}');
    const first = await provider.generate("x", { json: true });
    const second = await provider.generate("x", { json: true });
    expect(first).toBe(second);
  });
});

describe("generateJSON", () => {
  it("parses and validates a well-formed JSON response", async () => {
    const provider = new MockProvider().when("skill", JSON.stringify({ n: 42 }));
    const result = await generateJSON(provider, "generate skill", (raw) => {
      const obj = raw as { n: number };
      if (typeof obj.n !== "number") throw new Error("bad");
      return obj;
    });
    expect(result.n).toBe(42);
  });

  it("throws a descriptive error on invalid JSON", async () => {
    const provider = new MockProvider(() => "not json");
    await expect(generateJSON(provider, "x", (raw) => raw)).rejects.toThrow(/not valid JSON/);
  });
});
