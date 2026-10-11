"""Runs the real profiles/laya/worker.py main() with the model replaced by stubs.

Only the model-dependent pieces are stubbed (laya, torch, head_warnings, predict_results); the protocol loop and the
request admission (maxLen range, state/question counts, batch envelope, frame bound) are worker.py's own code.
Usage: laya-worker-stub-runner.py <profiles/laya dir>
"""
import sys
import types

profile = sys.argv[1]
laya = types.ModuleType("laya")
laya.__version__ = "stub"
laya.Agent = lambda model_dir, expected_sha256=None: types.SimpleNamespace(device="cpu", cfg={"max_len": 512, "head_max_len": 192})
torch = types.ModuleType("torch")
torch.__version__ = "stub"
sys.modules["laya"], sys.modules["torch"] = laya, torch
sys.path.insert(0, profile)
import worker  # noqa: E402

worker.head_warnings = lambda agent, questions, max_len=None: []
worker.predict_results = lambda agent, states, questions, max_len, strict_head, warnings: [
    {"answers": {name: ({"choice": next(iter(q["criteria"])), "confidence": 0.7} if q.get("type") == "choice" else
                        {"score": 0} if q.get("type") == "score" else {"noul": 0.5, "confidence": 0.5})
                 for name, q in questions.items()},
     "truncated": False, "stateTokensDropped": 0, "inputTokens": 1, "headTruncated": False, "headWarnings": []}
    for _ in states]
sys.argv = [sys.argv[0], "stub-model-dir", "{}"]
sys.exit(worker.main())
