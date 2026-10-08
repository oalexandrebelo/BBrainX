#!/usr/bin/env python3
"""Processo do perfil Laya do BBrainX.

Lê uma requisição JSON por linha na entrada padrão e escreve uma resposta JSON por linha na saída
padrão. Não abre porta e não recebe caminho de arquivo do projeto: só texto.
As bibliotecas usam modo offline; isto não é um sandbox de rede do sistema operacional.
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
MAX_REQUEST_BYTES = 4 * 1024 * 1024
ANSWER_FIELDS = ("choice", "score", "noul", "answer_confidence", "confidence", "probabilities")


def bounded_lines(stream):
    """Yield complete bounded request frames; an oversized frame is drained and represented by None."""
    while True:
        line = stream.readline(MAX_REQUEST_BYTES + 1)
        if not line:
            return
        if len(line) > MAX_REQUEST_BYTES:
            while line and not line.endswith(b"\n"):
                line = stream.readline(65536)
            yield None
        else:
            yield line


def head_warnings(agent, questions, max_len=None):
    """Return question ids whose actual Laya tokenized head loses instruction/option content."""
    from laya.common import build_head, encode_text, render_options

    tok = agent.tok
    head_max_len = agent.cfg.get("head_max_len", 192)
    effective_max_len = agent.cfg.get("max_len", 512) if max_len is None else max_len
    warnings = []
    for qid, qdef in questions.items():
        agent._check_question(qid, qdef)
        internal = agent._to_internal(qdef)
        ids, markers, stats = build_head(tok, internal, head_max_len)

        # The instruction uses the same sanitization and exact prefix rendered by build_head.
        instruction = str(internal["ins"]).replace(tok.mask_token, " ")
        complete_instruction = encode_text(
            tok, "%s question: %s" % (internal["t"], instruction), add_special_tokens=False
        )["input_ids"]
        instruction_end = markers[0] - 1 if markers else len(ids) - 1
        retained_instruction = ids[1:instruction_end]
        lost = len(retained_instruction) < len(complete_instruction)

        # Compare each full option's real token IDs with the option span emitted by build_head.
        # This catches both the hard 48-token cap and the smaller per-option budget.
        options = render_options(internal)
        for index, option in enumerate(options):
            start = markers[index] + 1
            end = markers[index + 1] if index + 1 < len(markers) else len(ids) - 1
            retained = ids[start:end]
            complete = encode_text(
                tok, " " + option.replace(tok.mask_token, " "), add_special_tokens=False
            )["input_ids"]
            if len(retained) < len(complete):
                lost = True

        # A head may fit head_max_len but be clipped by the request's total max_len.
        # The final separator is part of the question head and losing it is treated conservatively.
        if len(ids) > effective_max_len:
            lost = True
        if stats.get("options_distinct", stats.get("options", len(options))) < len(options):
            lost = True
        if lost:
            warnings.append(qid)
    return warnings


def predict_results(agent, states, questions, max_len, strict_head, warnings):
    """Apply the abstention contract and project Laya's result onto the worker protocol."""
    if strict_head and warnings:
        return [{"answers": {}, "truncated": True, "stateTokensDropped": 0,
                 "inputTokens": 0, "headTruncated": True, "headWarnings": warnings}
                for _ in states]
    raw = agent.predict_batch(states, questions, max_len=max_len)
    results = []
    for item in raw:
        usage = item.get("usage", {})
        answers = {name: {field: answer[field] for field in ANSWER_FIELDS if field in answer}
                   for name, answer in item.get("answers", {}).items()}
        results.append({"answers": answers, "truncated": bool(usage.get("truncated")),
                        "stateTokensDropped": int(usage.get("state_tokens_dropped") or 0),
                        "inputTokens": int(usage.get("input_tokens") or 0),
                        "headTruncated": bool(warnings), "headWarnings": warnings})
    return results


def main():
    model_dir, digests = sys.argv[1], json.loads(sys.argv[2])
    protocol = sys.stdout
    sys.stdout = sys.stderr  # bibliotecas que imprimem não podem corromper o protocolo

    def reply(message):
        protocol.write(json.dumps(message, ensure_ascii=False) + "\n")
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

    for raw_line in bounded_lines(sys.stdin.buffer):
        if raw_line is None:
            reply({"id": None, "ok": False, "error": "ValueError", "detail": "request exceeds 4 MiB"})
            continue
        request_id = None
        try:
            line = raw_line.decode("utf-8").strip()
            if not line:
                continue
            request = json.loads(line)
            request_id = request.get("id")
            if request.get("op") == "ping":
                reply({"id": request_id, "ok": True})
                continue
            states, questions = request["states"], request["questions"]
            strict_head = request.get("strictHead", False)
            if not isinstance(strict_head, bool):
                raise ValueError("strictHead must be a boolean")
            max_len = request.get("maxLen")
            if max_len is not None and (isinstance(max_len, bool) or not isinstance(max_len, int) or not 256 <= max_len <= 8192):
                raise ValueError("maxLen must be an integer from 256 to 8192")
            if not isinstance(states, list) or not 1 <= len(states) <= MAX_STATES:
                raise ValueError("states must be a list of 1 to %d items" % MAX_STATES)
            if not isinstance(questions, dict) or not 1 <= len(questions) <= MAX_QUESTIONS:
                raise ValueError("questions must be an object with 1 to %d entries" % MAX_QUESTIONS)
            if any(not isinstance(state, str) or len(state) > MAX_STATE_CHARS for state in states):
                raise ValueError("each state must be a string of at most %d characters" % MAX_STATE_CHARS)
            warnings = head_warnings(agent, questions, max_len=max_len)
            began = time.perf_counter()
            results = predict_results(agent, states, questions, max_len, strict_head, warnings)
            reply({"id": request_id, "ok": True, "results": results,
                   "ms": round((time.perf_counter() - began) * 1000, 1)})
        except Exception as error:
            reply({"id": request_id, "ok": False, "error": type(error).__name__, "detail": str(error)[:300]})
    return 0


if __name__ == "__main__":
    sys.exit(main())
