# C03 — llm-provider

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | C01 | C04 | S |

**Owns:** `content/src/llm.ts`, `content/test/llm.test.ts`

## Purpose

Imported from the code. `content/src/llm.ts` is the pipeline's text-in, text-out LLM client behind one
interface, `LLMProvider` (`name`, `generate(prompt, {json, system, maxTokens, temperature})`):

- `getProvider()` picks the provider from the environment at call time: Anthropic when `ANTHROPIC_API_KEY` is
  set, else OpenAI when `OPENAI_API_KEY` is set, else the offline `MockProvider`. `hasLiveProvider()` says
  whether a real provider would be picked.
- The Anthropic provider loads `@anthropic-ai/sdk` lazily and calls the Messages API with the model
  `claude-sonnet-4-5`; the OpenAI provider loads `openai` lazily and calls Chat Completions with `gpt-4.1`,
  asking for a JSON object when `json` is set. Both default to 4096 tokens and temperature 0.4, and both strip
  a code fence from the reply in JSON mode.
- `MockProvider` is deterministic and offline: `when(match, response)` registers a canned reply (a string or a
  function of the prompt) for prompts containing `match`; anything unmatched goes to a fallback responder
  (by default a small JSON object `{mock: true, promptLength}`); every call is recorded in `calls`.
- `stripCodeFence` removes a surrounding ` ```json ` or ` ``` ` fence; `generateJSON(provider, prompt, parse)`
  asks for JSON, parses it and hands it to the caller's `parse`, and on unparsable text throws an error naming
  the provider, "response was not valid JSON", and the raw reply.

## Tests

`content/test/llm.test.ts`: `stripCodeFence` (fenced, plain-fenced, unfenced), `MockProvider` (matching,
fallback, call recording, determinism) and `generateJSON` (parse and validate, invalid JSON). No test touches
the Anthropic or OpenAI providers or `getProvider`.

## Changes

none: imported

## Gate

- **C03-AC-1** — `stripCodeFence` removes a ` ```json ` fence and a plain ` ``` ` fence, and leaves unfenced text unchanged. *Verify:* `content/test/llm.test.ts` ("stripCodeFence").
- **C03-AC-2** — `MockProvider` returns the canned reply of the first rule whose match string the prompt contains, and the fallback responder's reply otherwise. *Verify:* `content/test/llm.test.ts` ("MockProvider" › "returns the matching canned response for a prompt substring", "falls back to the default responder when nothing matches").
- **C03-AC-3** — `MockProvider` records every prompt it receives, in order, and answers the same prompt the same way each time. *Verify:* `content/test/llm.test.ts` ("records every call it receives", "never hits the network — is fully offline/deterministic").
- **C03-AC-4** — `generateJSON` returns what the caller's parser returns for a well-formed JSON reply, and rejects with an error containing "not valid JSON" for a reply that is not JSON. *Verify:* `content/test/llm.test.ts` ("generateJSON").
- **C03-AC-5** — `getProvider` picks Anthropic when `ANTHROPIC_API_KEY` is set, else OpenAI when `OPENAI_API_KEY` is set, else `MockProvider`. *Verify:* unpinned.
- **C03-AC-6** — The Anthropic and OpenAI SDKs are loaded only when their provider first generates, so importing `llm.ts` loads neither. *Verify:* unpinned.

## Risks

- Without either key, `getProvider` silently returns `MockProvider`, whose default reply fails the stages'
  schemas: `npm run blueprint` or `npm run generate` without a key fails with a zod error, not an error naming
  the missing key (principle 7).
- The model ids `claude-sonnet-4-5` and `gpt-4.1` are hard-coded; a retired model breaks generation, and
  nothing in the tests notices.
- The Anthropic provider has no JSON mode: it relies on the prompt and `stripCodeFence`; a reply with prose
  around the fence fails to parse.
- The live providers make paid network calls and are untested by design (principle 4).
