# V02 — tutor-prompt

| Track | Deps | Unlocks | Size |
|---|---|---|---|
| done | none | V05 | S |

**Owns:** `voice-agent/prompts.py`, `voice-agent/tests/`

## Purpose

Imported from the code. `voice-agent/prompts.py` builds the voice tutor's system prompt. It is a pure module
(standard library only, no environment, no LiveKit), so it imports with zero env vars set (principle 5).

- `build_system_prompt(level, scenario=None)` normalises `level` (trimmed, upper-cased) and raises
  `ValueError` unless it is A1, A2, B1 or B2.
- The prompt is a fixed Bosnian base (the tutor "Ljiljan"; rules: speak only Bosnian and never switch to
  English, adapt to the CEFR level, correct gently, ask questions, role-play on request, keep replies short and
  speakable), then the level's guidance, which names the level and tunes vocabulary, sentence complexity
  and correction style.
- With a `scenario`, a role-play instruction is appended: the text for `cafe`, `directions` or `introductions`
  (case-insensitive), else a generic instruction that quotes the scenario as given.

`voice-agent/tests/` holds the package's unittest suite (`__init__.py` and `test_prompts.py`); it puts
`voice-agent/` on `sys.path` and needs no install, network or keys.

## Tests

`voice-agent/tests/test_prompts.py` (`BuildSystemPromptTests`, 9 tests): the Bosnian-only rule, each level
reflected, the A1 and B2 prompts differing, lower-case and padded levels, invalid levels, a known and an
unknown scenario, and no scenario by default.

## Changes

none: imported

## Gate

- **V02-AC-1** — The prompt tells the tutor to speak only Bosnian and never to switch to English. *Verify:* `voice-agent/tests/test_prompts.py` ("test_bosnian_only_instruction_present").
- **V02-AC-2** — Each of A1, A2, B1 and B2 appears in its prompt, and the A1 and B2 prompts differ. *Verify:* `voice-agent/tests/test_prompts.py` ("test_level_is_reflected_for_every_supported_level"), `voice-agent/tests/test_prompts.py` ("test_level_guidance_differs_across_levels").
- **V02-AC-3** — A level in lower case or with surrounding spaces is accepted as its upper-case level. *Verify:* `voice-agent/tests/test_prompts.py` ("test_lowercase_level_is_normalized"), `voice-agent/tests/test_prompts.py` ("test_whitespace_around_level_is_tolerated").
- **V02-AC-4** — `C1` and an empty level raise `ValueError`. *Verify:* `voice-agent/tests/test_prompts.py` ("test_invalid_level_raises_value_error").
- **V02-AC-5** — A scenario that is not a known name is added to the prompt with its name quoted, and a prompt built without a scenario has no generic scenario instruction. *Verify:* `voice-agent/tests/test_prompts.py` ("test_unknown_scenario_still_honored_generically"), `voice-agent/tests/test_prompts.py` ("test_no_scenario_by_default").
- **V02-AC-6** — A known scenario (`cafe`, `directions` or `introductions`, in any case) appends its own role-play text. *Verify:* unpinned.

## Risks

- The Bosnian wording has not been reviewed by a native speaker (principle 3; the module says so); the B1
  guidance has "precesnije", which reads like a misspelling.
- The scenario is free text from the room metadata (B09 passes it unchecked) and is put into the system prompt
  as given, so a client can add its own instructions to the tutor.
- The tests check words in the prompt, not how the model behaves with it.
- `test_known_scenario_included_when_given` looks for "kafić", which the base prompt's rule 5 already
  contains, so it passes even when no scenario text is added (V02-AC-6 is unpinned for that reason).
