#!/usr/bin/env python3
"""Verificadores e mecanismos de laboratório, não um runtime BBrainX.

Somente biblioteca padrão. Os enumeradores modelam interleavings sequencialmente
consistentes: não executam o Rust inseguro, não provam o modelo de memória ARM e
não medem inferência. O ledger exercita transações SQLite reais entre processos.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import math
import sqlite3
import sys
import time
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence


def schedules(lengths: Sequence[int]) -> Iterator[tuple[int, ...]]:
    """Todas as intercalações que preservam a ordem de cada participante."""
    if not lengths or any(type(n) is not int or n < 0 for n in lengths):
        raise ValueError("Comprimentos inteiros não negativos obrigatórios.")
    def visit(remaining: tuple[int, ...], prefix: tuple[int, ...]):
        if not any(remaining):
            yield prefix
            return
        for actor, count in enumerate(remaining):
            if count:
                updated = list(remaining)
                updated[actor] -= 1
                yield from visit(tuple(updated), prefix + (actor,))
    yield from visit(tuple(lengths), ())


def original_ring_writers() -> dict:
    """Modela literalmente load(tail), grava slot, store(tail+1), dois produtores."""
    failures = []
    histories = 0
    for order in schedules((3, 3)):
        histories += 1
        pc, local_tail, tail, slots = [0, 0], [None, None], 0, {}
        trace = []
        for actor in order:
            step = pc[actor]
            if step == 0:
                local_tail[actor] = tail
                event = f"P{actor}.load_tail={tail}"
            elif step == 1:
                slots[local_tail[actor]] = actor
                event = f"P{actor}.write_slot={local_tail[actor]}"
            else:
                tail = local_tail[actor] + 1
                event = f"P{actor}.store_tail={tail}"
            pc[actor] += 1
            trace.append(event)
        if tail != 2 or set(slots.values()) != {0, 1}:
            failures.append({"trace": trace, "tail": tail, "slots": slots})
    return {"histories": histories, "violations": len(failures),
            "witness": failures[0], "model": "two producers; three SC steps each; no consumer"}


def serialized_writer_spec() -> dict:
    """Especificação atômica de publicação. NÃO implementa uma fila lock-free."""
    histories, violations = 0, 0
    for order in schedules((1, 1)):
        histories += 1
        slots = []
        for actor in order:
            slots.append(actor)
        violations += set(slots) != {0, 1} or len(slots) != 2
    return {"histories": histories, "violations": violations,
            "model": "serializable enqueue transition; implementation must provide this atomicity"}


def revocation_interleavings(guarded: bool) -> dict:
    """Linearização de liberar resultado versus revogar; não modela bytes em trânsito."""
    histories, violations, witnesses = 0, 0, []
    for order in schedules((3, 1)):
        epoch, permitted, observed, observed_allowed = 0, True, None, False
        pc, released = 0, False
        trace = []
        for actor in order:
            if actor == 1:
                epoch += 1
                permitted = False
                trace.append("authority.revoke_commit")
            elif pc == 0:
                observed, observed_allowed = epoch, permitted
                trace.append(f"worker.read_epoch={epoch};allowed={permitted}")
                pc += 1
            elif pc == 1:
                trace.append("worker.compute")
                pc += 1
            else:
                released = observed_allowed and (not guarded or (observed == epoch and permitted))
                trace.append(f"worker.release={released}")
                if released and not permitted:
                    violations += 1
                    witnesses.append(trace.copy())
                pc += 1
        histories += 1
    return {"histories": histories, "violations": violations,
            "witness": witnesses[0] if witnesses else None,
            "model": "one read/compute/release and one revoke; release guard atomic"}


def attachment_checksum(payload: bytes) -> int:
    value = 1
    for byte in payload:
        value = (value + byte) % 65521
    return value


def sign_collision() -> dict:
    a, b = [1.0] * 512, [1.0] * 512
    a[0], b[1] = 1000.0, 1000.0
    hamming = sum((x > 0) != (y > 0) for x, y in zip(a, b))
    cosine = sum(x * y for x, y in zip(a, b)) / (
        math.sqrt(sum(x*x for x in a)) * math.sqrt(sum(y*y for y in b)))
    return {"dimensions": 512, "sign_hamming": hamming, "cosine": cosine,
            "meaning": "same signs do not imply high cosine; no claim about any trained embedding dataset"}


@dataclass(frozen=True)
class RateDecision:
    accepted: bool
    next_tat_ns: int
    retry_after_ns: int


def gcra(now_ns: int, tat_ns: int, interval_ns: int, burst_units: int, cost: int) -> RateDecision:
    """GCRA ponderado puro. burst_units é a capacidade total, não max_burst de CL.THROTTLE.

    Requer clock de admissão monotônico de uma autoridade. O armazenamento/TAT e
    a admissão precisam ser atômicos; esta função não oferece sincronização.
    """
    values = (now_ns, tat_ns, interval_ns, burst_units, cost)
    if any(type(v) is not int for v in values):
        raise TypeError("Estado e custo devem ser inteiros, sem booleanos.")
    if now_ns < 0 or tat_ns < 0 or interval_ns <= 0 or burst_units <= 0 or cost <= 0:
        raise ValueError("Estado ou configuração inválido.")
    if cost > burst_units:
        raise ValueError("Custo excede toda a capacidade do burst.")
    candidate = max(now_ns, tat_ns) + cost * interval_ns
    threshold = now_ns + burst_units * interval_ns
    if candidate <= threshold:
        return RateDecision(True, candidate, 0)
    return RateDecision(False, tat_ns, candidate - threshold)


SCHEMA = """
CREATE TABLE balance(
  project TEXT PRIMARY KEY,
  total INTEGER NOT NULL CHECK(total >= 0),
  available INTEGER NOT NULL CHECK(available >= 0),
  reserved INTEGER NOT NULL CHECK(reserved >= 0),
  spent INTEGER NOT NULL CHECK(spent >= 0),
  CHECK(available + reserved + spent = total)
);
CREATE TABLE operations(
  project TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  reserved_amount INTEGER NOT NULL CHECK(reserved_amount > 0),
  actual_amount INTEGER,
  state TEXT NOT NULL CHECK(state IN ('reserved','unknown','settled')),
  PRIMARY KEY(project,operation_id),
  FOREIGN KEY(project) REFERENCES balance(project)
);
CREATE TABLE outbox(
  event_id INTEGER PRIMARY KEY,
  project TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  UNIQUE(project,operation_id,kind)
);
"""


def connection(database: str | Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(database), timeout=10, isolation_level=None)
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA synchronous=FULL")
    con.execute("PRAGMA busy_timeout=10000")
    return con


def initialize(database: str | Path, total: int = 10, project: str = "lab") -> None:
    if type(total) is not int or not 0 <= total <= (1 << 62):
        raise ValueError("Orçamento inválido.")
    con = connection(database)
    try:
        mode = con.execute("PRAGMA journal_mode=WAL").fetchone()[0]
        if mode.lower() != "wal":
            raise RuntimeError("WAL não está disponível.")
        con.executescript(SCHEMA)
        con.execute("INSERT INTO balance VALUES (?,?,?,0,0)", (project, total, total))
    finally:
        con.close()


def _validate_reservation(project: str, operation_id: str, amount: int) -> None:
    for name, value in (("project", project), ("operation_id", operation_id)):
        if not isinstance(value, str) or not value or len(value) > 128 or "\x00" in value:
            raise ValueError(f"Identificador inválido: {name}")
    if type(amount) is not int or not 0 < amount <= (1 << 62):
        raise ValueError("Reserva deve ser positiva e caber no domínio inteiro adotado.")


def reserve(database: str | Path, project: str, operation_id: str, amount: int,
            pause_at: str | None = None) -> str:
    """Transação real. A pausa é ponto de controle para SIGKILL no laboratório.

    Estado limitado a reservas abstratas; não chama provedores, autentica clientes
    ou faz a reserva ser uma fatura de API. Idempotência por projeto/operação.
    """
    _validate_reservation(project, operation_id, amount)
    if pause_at not in (None, "before_commit", "after_commit"):
        raise ValueError("Ponto de interrupção desconhecido.")
    fingerprint = hashlib.sha256(json.dumps([project, operation_id, amount],
                                             separators=(",", ":")).encode()).hexdigest()
    con = connection(database)
    try:
        con.execute("BEGIN IMMEDIATE")
        old = con.execute("SELECT fingerprint,state FROM operations WHERE project=? AND operation_id=?",
                          (project, operation_id)).fetchone()
        if old:
            if old[0] != fingerprint:
                raise ValueError("IDEMPOTENCY_CONFLICT")
            con.execute("COMMIT")
            return "replayed"
        row = con.execute("""UPDATE balance SET available=available-?, reserved=reserved+?
           WHERE project=? AND available>=? RETURNING available""", (amount, amount, project, amount)).fetchone()
        if row is None:
            con.execute("ROLLBACK")
            return "denied"
        con.execute("INSERT INTO operations VALUES (?,?,?,?,NULL,'reserved')",
                    (project, operation_id, fingerprint, amount))
        con.execute("INSERT INTO outbox(project,operation_id,kind) VALUES (?,?,'reserved')",
                    (project, operation_id))
        if pause_at == "before_commit":
            print("BEFORE_COMMIT", flush=True)
            # O controlador encerra este processo; timeout torna uma falha de teste limitada.
            time.sleep(20)
            raise RuntimeError("Controlador não encerrou o processo no prazo do experimento.")
        con.execute("COMMIT")
        if pause_at == "after_commit":
            print("AFTER_COMMIT", flush=True)
            time.sleep(20)
            raise RuntimeError("Controlador não encerrou o processo após o commit.")
        return "reserved"
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise
    finally:
        con.close()


def mark_unknown(database: str | Path, project: str, operation_id: str) -> str:
    con = connection(database)
    try:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute("SELECT state FROM operations WHERE project=? AND operation_id=?",
                          (project, operation_id)).fetchone()
        if row is None:
            raise KeyError("OPERATION_NOT_FOUND")
        if row[0] == "settled":
            raise ValueError("ALREADY_SETTLED")
        con.execute("UPDATE operations SET state='unknown' WHERE project=? AND operation_id=?",
                    (project, operation_id))
        con.execute("INSERT OR IGNORE INTO outbox(project,operation_id,kind) VALUES (?,?,'unknown')",
                    (project, operation_id))
        con.execute("COMMIT")
        return "unknown"
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise
    finally:
        con.close()


def settle(database: str | Path, project: str, operation_id: str, actual: int) -> str:
    if type(actual) is not int or not 0 <= actual <= (1 << 62):
        raise ValueError("Liquidação inválida.")
    con = connection(database)
    try:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute("SELECT reserved_amount,actual_amount,state FROM operations WHERE project=? AND operation_id=?",
                          (project, operation_id)).fetchone()
        if row is None:
            raise KeyError("OPERATION_NOT_FOUND")
        amount, previous, state = row
        if state == "settled":
            if previous != actual:
                raise ValueError("SETTLEMENT_CONFLICT")
            con.execute("COMMIT")
            return "replayed"
        if actual > amount:
            # Provedor que excede reserva demanda reconciliação fora deste modelo.
            raise ValueError("ACTUAL_EXCEEDS_RESERVATION")
        con.execute("UPDATE balance SET available=available+?, reserved=reserved-?, spent=spent+? WHERE project=?",
                    (amount-actual, amount, actual, project))
        con.execute("UPDATE operations SET state='settled',actual_amount=? WHERE project=? AND operation_id=?",
                    (actual, project, operation_id))
        con.execute("INSERT INTO outbox(project,operation_id,kind) VALUES (?,?,'settled')",
                    (project, operation_id))
        con.execute("COMMIT")
        return "settled"
    except BaseException:
        if con.in_transaction:
            con.execute("ROLLBACK")
        raise
    finally:
        con.close()


def read_ledger(database: str | Path) -> dict:
    con = connection(database)
    try:
        con.execute("BEGIN")
        balances = con.execute("SELECT project,total,available,reserved,spent FROM balance ORDER BY project").fetchall()
        operations = con.execute("SELECT project,operation_id,reserved_amount,actual_amount,state FROM operations ORDER BY project,operation_id").fetchall()
        events = con.execute("SELECT project,operation_id,kind FROM outbox ORDER BY event_id").fetchall()
        integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
        con.execute("COMMIT")
        return {"balances": balances, "operations": operations, "events": events, "integrity": integrity}
    finally:
        con.close()


def analytical_report() -> dict:
    service = 0.008
    arrival = 100
    rho = service * arrival
    return {
        "original_ring": original_ring_writers(),
        "serialized_enqueue_spec": serialized_writer_spec(),
        "original_revocation": revocation_interleavings(False),
        "guarded_release_spec": revocation_interleavings(True),
        "checksum": {"ab_attachment": attachment_checksum(b"ab"), "ba_attachment": attachment_checksum(b"ba"),
                     "ab_adler32": zlib.adler32(b"ab"), "ba_adler32": zlib.adler32(b"ba")},
        "sign_quantization": sign_collision(),
        "ring_payload_capacity_bytes": 512 * 16384,
        "queue_example": {"assumptions": "M/D/1, Poisson arrivals, deterministic service, single server, no inference measured",
                          "service_ms": service*1000, "arrival_per_second": arrival, "utilization": rho,
                          "mean_queue_ms": arrival*service*service/(2*(1-rho))*1000},
        "tail_buffer_example": {"traces_per_second": 2000, "retention_seconds": 8,
                                "bytes_per_trace": 4096, "payload_mib": 2000*8*4096/(1024**2)},
        "classification": "finite-model counterexamples and dimensional calculations; not performance benchmark"
    }


def _main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "reserve-child":
        if len(sys.argv) != 7:
            raise ValueError("reserve-child DB PROJECT OP AMOUNT PAUSE")
        _, _, database, project, op, amount, pause = sys.argv
        if pause == "barrier":
            print("READY", flush=True)
            if sys.stdin.readline().strip() != "GO":
                raise RuntimeError("Barreira de início inválida.")
            pause = "none"
        outcome = reserve(database, project, op, int(amount), None if pause == "none" else pause)
        print(outcome, flush=True)
        return 0
    print(json.dumps(analytical_report(), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
