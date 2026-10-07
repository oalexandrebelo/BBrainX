#!/usr/bin/env python3
"""Registra a origem dos trechos auditados sem redistribuir o anexo integral."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path

MARKERS = {
    "physical_analogy": "Princípio da Equivalência de Einstein-Laya",
    "linux_path": 'format!("/dev/shm/{}", shm_name)',
    "unreserved_tail_load": 'tail_index.value.load(Ordering::Relaxed)',
    "tail_publication": 'tail_index.value.store(current_tail.wrapping_add(1)',
    "checksum_fold": 'payload.iter().fold(1u32',
    "unchecked_slice": 'slice::from_raw_parts((*slot_ptr).payload.as_ptr(), len)',
    "cuda_not_tensorrt_provider": 'with_execution_providers([CUDAExecutionProvider',
    "unestablished_output": 'outputs["safety_logit"]',
    "copy_in_input": 'input_ids.to_vec()',
    "linux_affinity": 'libc::pthread_setaffinity_np',
    "cache_fast_path": 'self.vector_cache.match_nearest_simd(embedding, 12)',
    "later_safety_check": 'if !decision.is_safe',
    "constant_display_latency": 'latencyMs = 1.2',
}


def audit(source: Path) -> dict:
    raw = source.read_bytes()
    if len(raw) > 5 * 1024 * 1024:
        raise ValueError("Fonte excede o limite desta inspeção textual.")
    text = raw.decode("utf-8")
    lines = text.splitlines()
    matches = {name: [n for n, line in enumerate(lines, 1) if marker in line]
               for name, marker in MARKERS.items()}
    return {
        "source_name": source.name, "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw), "line_count": len(lines), "markers": matches,
        "all_expected_markers_found": all(matches.values()),
        "classification": "textual provenance only, not compilation or safety proof",
        "line_number_scope": "raw uploaded file; differs from tool-rendered metadata line numbers",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = audit(args.source)
    content = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding="utf-8")
    else:
        print(content, end="")
    raise SystemExit(0 if report["all_expected_markers_found"] else 1)
