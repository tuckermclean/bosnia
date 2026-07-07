"""Unit tests for prompts.build_system_prompt.

Runnable with either:

    python -m unittest discover -s tests -t .     (from voice-agent/)
    python -m pytest tests/                        (if pytest is installed)

No network, no secrets, no LiveKit -- prompts.py is a pure function module.
"""

from __future__ import annotations

import os
import sys
import unittest

# Make `import prompts` work regardless of the current working directory or
# how the test runner was invoked (voice-agent/ is not an installed package).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from prompts import build_system_prompt  # noqa: E402


class BuildSystemPromptTests(unittest.TestCase):
    def test_bosnian_only_instruction_present(self):
        prompt = build_system_prompt("A1")
        lowered = prompt.lower()
        # The never-switch-to-English rule must be present, not just "some
        # Bosnian text" -- the rule text itself is the load-bearing part.
        self.assertIn("isključivo na bosanskom", lowered)
        self.assertIn("nikad ne prelaziš na engleski", lowered)

    def test_level_is_reflected_for_every_supported_level(self):
        for level in ["A1", "A2", "B1", "B2"]:
            prompt = build_system_prompt(level)
            self.assertIn(level, prompt, f"level {level!r} not reflected in prompt")

    def test_level_guidance_differs_across_levels(self):
        # Not just the label -- the actual guidance text must change with level.
        a1 = build_system_prompt("A1")
        b2 = build_system_prompt("B2")
        self.assertNotEqual(a1, b2)

    def test_lowercase_level_is_normalized(self):
        prompt = build_system_prompt("a1")
        self.assertIn("A1", prompt)

    def test_whitespace_around_level_is_tolerated(self):
        prompt = build_system_prompt("  b1  ")
        self.assertIn("B1", prompt)

    def test_invalid_level_raises_value_error(self):
        with self.assertRaises(ValueError):
            build_system_prompt("C1")
        with self.assertRaises(ValueError):
            build_system_prompt("")

    def test_known_scenario_included_when_given(self):
        prompt = build_system_prompt("B1", scenario="cafe")
        self.assertIn("kafić", prompt.lower())

    def test_unknown_scenario_still_honored_generically(self):
        prompt = build_system_prompt("A2", scenario="pijaca")
        self.assertIn("pijaca", prompt.lower())

    def test_no_scenario_by_default(self):
        prompt = build_system_prompt("A1")
        self.assertNotIn("scenariju", prompt.lower())


if __name__ == "__main__":
    unittest.main()
