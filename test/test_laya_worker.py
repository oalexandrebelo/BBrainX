"""Tokenizer-only regression checks for the installed, pinned Laya question encoder.

Run with the profile's Python and BBRAINX_LAYA_TEST_HOME pointing at its state home.
No encoder weights are loaded and no inference is run.
"""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "profiles" / "laya"))
import worker

HOME = os.environ.get("BBRAINX_LAYA_TEST_HOME")
PROFILE = Path(HOME, "profiles", "laya") if HOME else None
MODEL = PROFILE / "models" / "multilingual" if PROFILE else None


@unittest.skipUnless(MODEL and (MODEL / "tokenizer" / "tokenizer.json").is_file(),
                     "set BBRAINX_LAYA_TEST_HOME to an installed Laya profile home")
class HeadPreflightTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from transformers import AutoTokenizer
        from laya.agent import Agent
        cls.worker = worker
        cls.model = Agent.__new__(Agent)
        cls.model.tok = AutoTokenizer.from_pretrained(str(MODEL / "tokenizer"), local_files_only=True)
        cls.model.cfg = {"max_len": 512, "head_max_len": 192}

    def test_complete_head_has_no_warning_and_long_instruction_is_reported(self):
        questions = {"short": {"type": "noul", "instructions": "Is this relevant?", "criteria": {"false": "no", "true": "yes"}}}
        self.assertEqual(self.worker.head_warnings(self.model, questions), [])

        long_questions = {"long": {"type": "noul", "instructions": "relevant " * 500,
                                    "criteria": {"false": "no", "true": "yes"}}}
        self.assertEqual(self.worker.head_warnings(self.model, long_questions), ["long"])

    def test_option_text_cut_or_collapsed_is_reported(self):
        questions = {"choice": {"type": "choice", "instructions": "Choose one",
                                "criteria": {"A": "similar " * 80 + " ending A",
                                             "B": "similar " * 80 + " ending B"}}}
        self.assertEqual(self.worker.head_warnings(self.model, questions), ["choice"])

    def test_small_total_max_length_that_clips_question_head_is_reported(self):
        questions = {"head": {"type": "noul", "instructions": "Is this relevant?", "criteria": {"false": "no", "true": "yes"}}}
        self.assertEqual(self.worker.head_warnings(self.model, questions, max_len=8), ["head"])


class StrictHeadProtocolTest(unittest.TestCase):
    def test_strict_mode_abstains_without_calling_inference(self):
        class Agent:
            calls = 0

            def predict_batch(self, states, questions, max_len=None):
                self.calls += 1
                return [{"answers": {"q": {"noul": 0.99}}, "usage": {}} for _ in states]

        agent = Agent()
        results = worker.predict_results(agent, ["a", "b"], {"q": {}}, 512, True, ["q"])
        self.assertEqual(agent.calls, 0)
        self.assertEqual(results, [
            {"answers": {}, "truncated": True, "stateTokensDropped": 0, "inputTokens": 0,
             "headTruncated": True, "headWarnings": ["q"]},
            {"answers": {}, "truncated": True, "stateTokensDropped": 0, "inputTokens": 0,
             "headTruncated": True, "headWarnings": ["q"]},
        ])

    def test_non_strict_mode_keeps_historical_answer_and_surfaces_warning(self):
        class Agent:
            def predict_batch(self, states, questions, max_len=None):
                return [{"answers": {"q": {"noul": 0.99, "debug": "discarded"}},
                         "usage": {"truncated": False, "state_tokens_dropped": 0, "input_tokens": 12}}
                        for _ in states]

        results = worker.predict_results(Agent(), ["a"], {"q": {}}, 512, False, ["q"])
        self.assertEqual(results[0]["answers"], {"q": {"noul": 0.99}})
        self.assertFalse(results[0]["truncated"])
        self.assertTrue(results[0]["headTruncated"])
        self.assertEqual(results[0]["headWarnings"], ["q"])


if __name__ == "__main__":
    unittest.main()
