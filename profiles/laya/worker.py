#!/usr/bin/env python3
"""Processo do perfil Laya do BBrainX.

Lê uma requisição JSON por linha na entrada padrão e escreve uma resposta JSON por linha na saída
padrão. Não abre porta, não acessa a rede e não recebe caminho de arquivo do projeto: só texto.
Os pesos são conferidos por SHA-256 antes de serem lidos. Uso: worker.py <pasta-do-checkpoint> <json-dos-hashes>
"""
import json
import os
import sys
import time

# Nenhum download em tempo de execução: os pesos já estão em disco, conferidos na instalação.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

MAX_STATES = 64
MAX_QUESTIONS = 16
MAX_STATE_CHARS = 50000
MAX_REQUEST_BYTES = 1048576
ANSWER_FIELDS = ("choice", "score", "noul", "answer_confidence", "confidence", "probabilities")


def main():
    model_dir, digests = sys.argv[1], json.loads(sys.argv[2])
    protocol = sys.stdout
    sys.stdout = sys.stderr  # bibliotecas que imprimem não podem corromper o protocolo

    def reply(message):
        protocol.write(json.dumps(message, ensure_ascii=False, allow_nan=False) + "\n")
        protocol.flush()

    started = time.perf_counter()
    try:
        import laya
        import torch

        agent = laya.Agent(model_dir, expected_sha256=digests)
        reply({"op": "ready", "ok": True, "laya": laya.__version__, "torch": torch.__version__,
               "device": str(agent.device), "loadMs": round((time.perf_counter() - started) * 1000)})
    except Exception as error:  # falha de carga é resposta, não rastro na saída do protocolo
        reply({"op": "ready", "ok": False, "error": type(error).__name__, "detail": str(error)[:300]})
        return 1

    while True:
        line = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
        if not line:
            break
        if len(line) > MAX_REQUEST_BYTES:
            return 2
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            request = json.loads(line)
            request_id = request.get("id")
            if request.get("op") == "ping":
                reply({"id": request_id, "ok": True})
                continue
            states, questions = request["states"], request["questions"]
            if not isinstance(states, list) or not 1 <= len(states) <= MAX_STATES:
                raise ValueError("states must be a list of 1 to %d items" % MAX_STATES)
            if not isinstance(questions, dict) or not 1 <= len(questions) <= MAX_QUESTIONS:
                raise ValueError("questions must be an object with 1 to %d entries" % MAX_QUESTIONS)
            if any(not isinstance(state, str) or len(state) > MAX_STATE_CHARS for state in states):
                raise ValueError("each state must be a string of at most %d characters" % MAX_STATE_CHARS)
            max_len = request.get("maxLen", 1024)
            if type(max_len) is not int or not 32 <= max_len <= 8192:
                raise ValueError("maxLen outside admitted bounds")
            rows = len(states) * len(questions)
            if rows > 128 or rows * max_len > 131072:
                raise ValueError("batch exceeds admitted envelope")
            began = time.perf_counter()
            raw = agent.predict_batch(states, questions, max_len=max_len)
            results = []
            for item in raw:
                usage = item.get("usage", {})
                answers = {name: {field: answer[field] for field in ANSWER_FIELDS if field in answer}
                           for name, answer in item.get("answers", {}).items()}
                results.append({"answers": answers, "truncated": usage.get("truncated") if isinstance(usage.get("truncated"), bool) else None,
                                "stateTokensDropped": usage.get("state_tokens_dropped"),
                                "inputTokens": usage.get("input_tokens")})
            reply({"id": request_id, "ok": True, "results": results,
                   "ms": round((time.perf_counter() - began) * 1000, 1)})
        except Exception as error:
            reply({"id": request_id, "ok": False, "error": type(error).__name__, "detail": str(error)[:300]})
    return 0


if __name__ == "__main__":
    sys.exit(main())
