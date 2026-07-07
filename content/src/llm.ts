/**
 * Pluggable LLM client for the content pipeline.
 *
 * Provider is chosen from env at call time:
 *  - ANTHROPIC_API_KEY set -> Anthropic (Claude)
 *  - else OPENAI_API_KEY set -> OpenAI
 *  - else -> MockProvider (offline, deterministic, used by tests / no-key runs)
 *
 * The "brain" for content generation need not be any particular vendor — this
 * module only needs a text-in/text-out (optionally JSON-mode) capability.
 */

export interface GenerateOptions {
  /** Ask the provider to return raw JSON text (no markdown fences). */
  json?: boolean;
  /** Optional system prompt. */
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  readonly name: string;
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
}

/** Strips ```json ... ``` / ``` ... ``` fences some models wrap JSON in. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1]!.trim() : trimmed;
}

class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private clientPromise: Promise<import("@anthropic-ai/sdk").default> | undefined;

  constructor(private apiKey: string) {}

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import("@anthropic-ai/sdk").then(
        (mod) => new mod.default({ apiKey: this.apiKey }),
      );
    }
    return this.clientPromise;
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const client = await this.client();
    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.4,
      system: options.system,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("\n")
      .trim();
    return options.json ? stripCodeFence(text) : text;
  }
}

class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private clientPromise: Promise<import("openai").default> | undefined;

  constructor(private apiKey: string) {}

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = import("openai").then((mod) => new mod.default({ apiKey: this.apiKey }));
    }
    return this.clientPromise;
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const client = await this.client();
    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 4096,
      response_format: options.json ? { type: "json_object" } : undefined,
      messages: [
        ...(options.system ? [{ role: "system" as const, content: options.system }] : []),
        { role: "user" as const, content: prompt },
      ],
    });
    const text = response.choices[0]?.message?.content ?? "";
    return options.json ? stripCodeFence(text) : text;
  }
}

/**
 * Deterministic, offline provider for tests and no-key local runs.
 * Callers can register canned responses keyed by a substring match against the
 * prompt, or supply a default responder function for anything unmatched.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";
  private rules: Array<{ match: string; response: string | ((prompt: string) => string) }> = [];
  private fallback: (prompt: string, options?: GenerateOptions) => string;
  public calls: Array<{ prompt: string; options?: GenerateOptions }> = [];

  constructor(fallback?: (prompt: string, options?: GenerateOptions) => string) {
    this.fallback =
      fallback ??
      ((prompt) => JSON.stringify({ mock: true, promptLength: prompt.length }));
  }

  /** Register a canned response for prompts containing `match`. */
  when(match: string, response: string | ((prompt: string) => string)): this {
    this.rules.push({ match, response });
    return this;
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    this.calls.push({ prompt, options });
    const rule = this.rules.find((r) => prompt.includes(r.match));
    const raw = rule
      ? typeof rule.response === "function"
        ? rule.response(prompt)
        : rule.response
      : this.fallback(prompt, options);
    return options.json ? stripCodeFence(raw) : raw;
  }
}

/** Resolve a provider from environment variables. Falls back to MockProvider. */
export function getProvider(): LLMProvider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (anthropicKey) return new AnthropicProvider(anthropicKey);
  if (openaiKey) return new OpenAIProvider(openaiKey);
  return new MockProvider();
}

/** True when a real (non-mock) provider would be selected. */
export function hasLiveProvider(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

/**
 * Generate JSON via the provider and parse it, throwing a descriptive error on
 * failure (bad JSON, or schema mismatch reported by the caller-supplied parser).
 */
export async function generateJSON<T>(
  provider: LLMProvider,
  prompt: string,
  parse: (raw: unknown) => T,
  options: GenerateOptions = {},
): Promise<T> {
  const raw = await provider.generate(prompt, { ...options, json: true });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `[llm:${provider.name}] response was not valid JSON: ${(err as Error).message}\n--- raw ---\n${raw}`,
    );
  }
  return parse(parsed);
}
