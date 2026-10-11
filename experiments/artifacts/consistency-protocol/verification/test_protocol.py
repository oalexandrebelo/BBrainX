#!/usr/bin/env python3
"""Testes reproduzíveis: estados finitos, aritmética e processos SQLite reais.

Não há double de provedor/modelo: os testes não chamam nem substituem inferência.
Os processos filhos escrevem num banco temporário e podem ser mortos pelo teste.
"""
from __future__ import annotations

import itertools
import json
import platform
import queue
import sqlite3
import subprocess
import sys
import tempfile
import threading
import unittest
import zlib
from fractions import Fraction
from pathlib import Path

from protocol_checks import (
    analytical_report, attachment_checksum, connection, gcra, initialize,
    mark_unknown, original_ring_writers, read_ledger, reserve,
    revocation_interleavings, schedules, serialized_writer_spec, settle,
    sign_collision,
)

SCRIPT = Path(__file__).with_name("protocol_checks.py")


def read_line(child: subprocess.Popen, expected: str) -> None:
    result: queue.Queue = queue.Queue()
    def receive() -> None:
        try:
            result.put(child.stdout.readline())
        except BaseException as error:
            result.put(error)
    threading.Thread(target=receive, daemon=True).start()
    try:
        line = result.get(timeout=10)
    except queue.Empty as error:
        child.kill()
        child.wait(timeout=5)
        raise AssertionError(f"Filho não atingiu a barreira {expected}") from error
    if isinstance(line, BaseException):
        raise line
    if line.strip() != expected:
        raise AssertionError(f"Esperado {expected!r}; recebido {line!r}")


class InterleavingTests(unittest.TestCase):
    def test_enumeration_preserves_actor_order_and_covers_twenty_histories(self):
        result = list(schedules((3, 3)))
        self.assertEqual(len(result), 20)
        self.assertEqual(len(set(result)), 20)
        self.assertTrue(all(s.count(0) == 3 and s.count(1) == 3 for s in result))

    def test_original_ring_has_lost_updates_even_under_sequential_consistency(self):
        result = original_ring_writers()
        self.assertGreater(result["violations"], 0)
        self.assertLess(result["violations"], result["histories"])
        self.assertEqual(result["witness"]["tail"], 1)

    def test_serializable_enqueue_spec_has_no_loss_in_bounded_model(self):
        self.assertEqual(serialized_writer_spec(), {
            "histories": 2, "violations": 0,
            "model": "serializable enqueue transition; implementation must provide this atomicity"})

    def test_original_release_can_follow_a_revocation(self):
        result = revocation_interleavings(False)
        self.assertEqual(result["histories"], 4)
        self.assertGreater(result["violations"], 0)

    def test_epoch_guard_rejects_revocation_before_release(self):
        self.assertEqual(revocation_interleavings(True)["violations"], 0)

    def test_head_filter_does_not_reach_a_later_matching_item(self):
        queue_contents, head, mask = [1, 2], 0, 2
        for _ in range(16):
            if queue_contents[head] & mask or mask == 0:
                head += 1
        self.assertEqual(head, 0)
        self.assertEqual(queue_contents[1] & mask, mask)

    def test_one_global_cursor_is_not_broadcast(self):
        items, head = ["checkpoint-v1"], 0
        first = items[head]
        head += 1
        second = items[head] if head < len(items) else None
        self.assertEqual(first, "checkpoint-v1")
        self.assertIsNone(second)

    def test_attachment_checksum_is_not_adler32(self):
        self.assertEqual(attachment_checksum(b"ab"), attachment_checksum(b"ba"))
        self.assertNotEqual(zlib.adler32(b"ab"), zlib.adler32(b"ba"))

    def test_sign_collision_does_not_imply_cosine_similarity(self):
        result = sign_collision()
        self.assertEqual(result["sign_hamming"], 0)
        self.assertLess(result["cosine"], 0.003)

    def test_ring_capacity_is_eight_mib_before_header(self):
        self.assertEqual(512 * 16384, 8 * 1024**2)

    def test_global_readers_mask_does_not_encode_per_reader_epochs(self):
        mask = 3
        state_a, state_b = (1, 5), (4, 5)
        retired_epoch = 2
        # Mesmo bitset de leitores ativos; decisões de reclamação opostas.
        self.assertEqual(mask, 0b11)
        self.assertFalse(all(epoch > retired_epoch for epoch in state_a))
        self.assertTrue(all(epoch > retired_epoch for epoch in state_b))


class GCRATests(unittest.TestCase):
    def test_full_burst_is_admitted_once(self):
        first = gcra(0, 0, 10, 4, 4)
        self.assertTrue(first.accepted)
        self.assertFalse(gcra(0, first.next_tat_ns, 10, 4, 1).accepted)

    def test_denial_preserves_tat(self):
        result = gcra(0, 40, 10, 4, 1)
        self.assertFalse(result.accepted)
        self.assertEqual(result.next_tat_ns, 40)
        self.assertEqual(result.retry_after_ns, 10)

    def test_one_interval_replenishes_one_unit(self):
        self.assertTrue(gcra(10, 40, 10, 4, 1).accepted)

    def test_cost_exceeding_burst_is_configuration_error(self):
        with self.assertRaises(ValueError):
            gcra(0, 0, 10, 4, 5)

    def test_invalid_numbers_are_rejected(self):
        for invalid in (True, 1.5, float("nan"), "1"):
            with self.subTest(invalid=repr(invalid)):
                with self.assertRaises(TypeError):
                    gcra(0, 0, 10, 4, invalid)
        with self.assertRaises(ValueError):
            gcra(-1, 0, 10, 4, 1)

    def test_equivalence_to_independent_fractional_token_bucket(self):
        # 70 sequências temporais x 81 sequências de custo = 5.670 histórias.
        histories = 0
        for arrivals in itertools.combinations_with_replacement(range(5), 4):
            for costs in itertools.product((1, 2, 3), repeat=4):
                tat, tokens, previous = 0, Fraction(4), 0
                for now, cost in zip(arrivals, costs):
                    tokens = min(Fraction(4), tokens + Fraction(now-previous, 2))
                    expected = tokens >= cost
                    if expected:
                        tokens -= cost
                    outcome = gcra(now, tat, 2, 4, cost)
                    self.assertEqual(outcome.accepted, expected)
                    tat, previous = outcome.next_tat_ns, now
                histories += 1
        self.assertEqual(histories, 5670)

    def test_no_float_rounding_at_large_monotonic_times(self):
        now = 10**20
        self.assertTrue(gcra(now, now, 1, 3, 3).accepted)
        self.assertFalse(gcra(now, now + 3, 1, 3, 1).accepted)


class SQLiteLedgerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="bbrainx-protocol-")
        self.addCleanup(self.directory.cleanup)
        self.database = Path(self.directory.name) / "ledger.sqlite"
        initialize(self.database)
        self.children = []
        self.addCleanup(self.close_children)

    def close_children(self):
        for child in self.children:
            if child.poll() is None:
                child.kill()
            child.wait(timeout=5)
            for stream in (child.stdin, child.stdout, child.stderr):
                if stream and not stream.closed:
                    stream.close()

    def child(self, operation: str, amount: int, pause: str):
        child = subprocess.Popen([sys.executable, str(SCRIPT), "reserve-child", str(self.database),
                                  "lab", operation, str(amount), pause], stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.children.append(child)
        return child

    def balance(self):
        data = read_ledger(self.database)
        self.assertEqual(data["integrity"], "ok")
        return data["balances"][0][2:]

    def test_reservation_and_outbox_are_committed_together(self):
        self.assertEqual(reserve(self.database, "lab", "a", 7), "reserved")
        self.assertEqual(self.balance(), (3, 7, 0))
        self.assertEqual(read_ledger(self.database)["events"], [("lab", "a", "reserved")])

    def test_insufficient_budget_is_not_partially_charged(self):
        self.assertEqual(reserve(self.database, "lab", "a", 11), "denied")
        self.assertEqual(self.balance(), (10, 0, 0))
        self.assertEqual(read_ledger(self.database)["operations"], [])

    def test_replay_does_not_double_charge(self):
        reserve(self.database, "lab", "a", 7)
        self.assertEqual(reserve(self.database, "lab", "a", 7), "replayed")
        self.assertEqual(self.balance(), (3, 7, 0))
        self.assertEqual(len(read_ledger(self.database)["events"]), 1)

    def test_changed_payload_with_same_operation_id_fails(self):
        reserve(self.database, "lab", "a", 7)
        with self.assertRaisesRegex(ValueError, "IDEMPOTENCY_CONFLICT"):
            reserve(self.database, "lab", "a", 6)
        self.assertEqual(self.balance(), (3, 7, 0))

    def test_negative_and_boolean_amounts_are_rejected(self):
        for amount in (-1, 0, True, 1 << 63):
            with self.subTest(amount=amount):
                with self.assertRaises(ValueError):
                    reserve(self.database, "lab", "a", amount)
        self.assertEqual(self.balance(), (10, 0, 0))

    def test_two_real_processes_cannot_overspend(self):
        a, b = self.child("a", 7, "barrier"), self.child("b", 7, "barrier")
        for child in (a, b):
            read_line(child, "READY")
        for child in (a, b):
            child.stdin.write("GO\n")
            child.stdin.flush()
        outcomes = []
        for child in (a, b):
            out, err = child.communicate(timeout=15)
            self.assertEqual(child.returncode, 0, err)
            outcomes.append(out.strip())
        self.assertCountEqual(outcomes, ["reserved", "denied"])
        self.assertEqual(self.balance(), (3, 7, 0))
        self.assertEqual(len(read_ledger(self.database)["events"]), 1)

    def test_same_operation_in_two_processes_has_one_effect(self):
        a, b = self.child("same", 7, "barrier"), self.child("same", 7, "barrier")
        for child in (a, b):
            read_line(child, "READY")
        for child in (a, b):
            child.stdin.write("GO\n")
            child.stdin.flush()
        outcomes = []
        for child in (a, b):
            out, err = child.communicate(timeout=15)
            self.assertEqual(child.returncode, 0, err)
            outcomes.append(out.strip())
        self.assertCountEqual(outcomes, ["reserved", "replayed"])
        self.assertEqual(self.balance(), (3, 7, 0))

    def test_process_killed_before_commit_leaves_no_partial_state(self):
        child = self.child("crash", 7, "before_commit")
        read_line(child, "BEFORE_COMMIT")
        child.kill()
        child.wait(timeout=5)
        self.assertEqual(self.balance(), (10, 0, 0))
        data = read_ledger(self.database)
        self.assertEqual(data["events"], [])
        self.assertEqual(data["operations"], [])

    def test_process_killed_after_commit_preserves_state_and_event(self):
        child = self.child("crash", 7, "after_commit")
        read_line(child, "AFTER_COMMIT")
        child.kill()
        child.wait(timeout=5)
        self.assertEqual(self.balance(), (3, 7, 0))
        self.assertEqual(len(read_ledger(self.database)["events"]), 1)
        self.assertEqual(reserve(self.database, "lab", "crash", 7), "replayed")

    def test_outbox_failure_rolls_back_reservation(self):
        con = connection(self.database)
        try:
            con.execute("CREATE TRIGGER fail_event BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'INJECTED_OUTBOX_FAILURE'); END;")
        finally:
            con.close()
        with self.assertRaisesRegex(sqlite3.IntegrityError, "INJECTED_OUTBOX_FAILURE"):
            reserve(self.database, "lab", "a", 7)
        self.assertEqual(self.balance(), (10, 0, 0))
        self.assertEqual(read_ledger(self.database)["operations"], [])

    def test_unknown_outcome_keeps_reservation(self):
        reserve(self.database, "lab", "a", 7)
        mark_unknown(self.database, "lab", "a")
        mark_unknown(self.database, "lab", "a")
        self.assertEqual(self.balance(), (3, 7, 0))
        self.assertEqual(len(read_ledger(self.database)["events"]), 2)
        self.assertEqual(reserve(self.database, "lab", "b", 4), "denied")

    def test_settlement_refunds_only_unused_reservation(self):
        reserve(self.database, "lab", "a", 7)
        mark_unknown(self.database, "lab", "a")
        self.assertEqual(settle(self.database, "lab", "a", 5), "settled")
        self.assertEqual(self.balance(), (5, 0, 5))
        self.assertEqual(settle(self.database, "lab", "a", 5), "replayed")
        self.assertEqual(self.balance(), (5, 0, 5))

    def test_conflicting_settlement_rejected(self):
        reserve(self.database, "lab", "a", 7)
        settle(self.database, "lab", "a", 5)
        with self.assertRaisesRegex(ValueError, "SETTLEMENT_CONFLICT"):
            settle(self.database, "lab", "a", 6)
        self.assertEqual(self.balance(), (5, 0, 5))

    def test_bill_larger_than_reservation_does_not_invent_credit(self):
        reserve(self.database, "lab", "a", 7)
        with self.assertRaisesRegex(ValueError, "ACTUAL_EXCEEDS_RESERVATION"):
            settle(self.database, "lab", "a", 8)
        self.assertEqual(self.balance(), (3, 7, 0))

    def test_project_partitions_do_not_share_budget(self):
        con = connection(self.database)
        try:
            con.execute("INSERT INTO balance VALUES ('other',10,10,0,0)")
        finally:
            con.close()
        reserve(self.database, "lab", "same", 7)
        reserve(self.database, "other", "same", 7)
        self.assertEqual([row[2:] for row in read_ledger(self.database)["balances"]], [(3, 7, 0), (3, 7, 0)])

    def test_fencing_rejects_old_writer_after_new_generation_accepted(self):
        con = connection(self.database)
        try:
            con.execute("CREATE TABLE resource(id TEXT PRIMARY KEY, fence INTEGER NOT NULL, body TEXT NOT NULL)")
            con.execute("INSERT INTO resource VALUES ('r',11,'old')")
            self.assertEqual(con.execute("UPDATE resource SET fence=12,body='new' WHERE id='r' AND fence<=12").rowcount, 1)
            self.assertEqual(con.execute("UPDATE resource SET fence=11,body='late-old' WHERE id='r' AND fence<=11").rowcount, 0)
            self.assertEqual(con.execute("SELECT fence,body FROM resource").fetchone(), (12, 'new'))
        finally:
            con.close()

    def test_read_snapshot_is_consistent_but_needs_fresh_publish_check(self):
        a, b = connection(self.database), connection(self.database)
        try:
            a.execute("CREATE TABLE authority(id INTEGER PRIMARY KEY,epoch INTEGER,allowed INTEGER)")
            a.execute("INSERT INTO authority VALUES (1,1,1)")
            a.execute("BEGIN")
            first = a.execute("SELECT epoch,allowed FROM authority").fetchone()
            b.execute("BEGIN IMMEDIATE")
            b.execute("UPDATE authority SET epoch=2,allowed=0 WHERE id=1")
            b.execute("COMMIT")
            self.assertEqual(a.execute("SELECT epoch,allowed FROM authority").fetchone(), first)
            a.execute("COMMIT")
            a.execute("BEGIN IMMEDIATE")
            self.assertEqual(a.execute("SELECT epoch,allowed FROM authority").fetchone(), (2, 0))
            a.execute("COMMIT")
        finally:
            a.close()
            b.close()


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromModule(sys.modules[__name__])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    report = {
        "schema_version": 1, "date": "2026-10-05",
        "environment": {"python": sys.version.split()[0], "sqlite": sqlite3.sqlite_version,
                        "platform": platform.system(), "architecture": platform.machine()},
        "tests_run": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
        "skipped": len(result.skipped), "passed": result.testsRun-len(result.failures)-len(result.errors)-len(result.skipped),
        "analytical": analytical_report(),
        "gcra_exhaustive_histories": 5670,
        "actual_execution": ["Python standard library", "SQLite WAL", "separate OS processes", "process kill before and after SQL COMMIT"],
        "not_executed": ["Rust compilation", "unsafe shared memory implementation", "BBrainX runtime integration",
                         "Laya inference", "macOS native validation", "SuperTokens/Infisical/Medusa/SigNoz/Unkey full services",
                         "performance benchmark", "power loss / storage controller failure", "GitHub publication"],
        "scope": "finite SC interleavings and laboratory mechanisms; not a proof for all schedules, ARM memory models or external effects"
    }
    target = Path(__file__).resolve().parents[1] / "evidence" / "verification.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, indent=2, ensure_ascii=False)+"\n", encoding="utf-8")
    raise SystemExit(0 if result.wasSuccessful() else 1)
