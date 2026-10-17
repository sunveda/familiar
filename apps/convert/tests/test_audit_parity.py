"""Fails when TS and Python audit kind / forbidden-key lists diverge.

Compares familiar_convert.audit against packages/shared/fixtures/audit-kinds.json and
against the TS sources (packages/shared/src/audit.ts and types.ts).
"""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.audit import (  # noqa: E402
    AUDIT_EVENT_KINDS,
    FORBIDDEN_AUDIT_KEYS,
    validate_audit_event,
)

SHARED = Path(__file__).resolve().parents[3] / "packages" / "shared"
FIXTURE = SHARED / "fixtures" / "audit-kinds.json"


def _ts_array(source: str, name: str) -> set[str]:
    start = source.index(f"export const {name}")
    end = source.index("];", start)
    return set(re.findall(r"'([a-z_]+)'", source[start:end]))


class AuditKindParityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.audit_ts = (SHARED / "src" / "audit.ts").read_text(encoding="utf-8")
        self.types_ts = (SHARED / "src" / "types.ts").read_text(encoding="utf-8")

    def test_python_kinds_match_fixture(self) -> None:
        self.assertEqual(set(AUDIT_EVENT_KINDS), set(self.fixture["kinds"]))

    def test_python_forbidden_keys_match_fixture(self) -> None:
        self.assertEqual(set(FORBIDDEN_AUDIT_KEYS), set(self.fixture["forbiddenKeys"]))

    def test_python_kinds_match_ts_audit_ts(self) -> None:
        self.assertEqual(set(AUDIT_EVENT_KINDS), _ts_array(self.audit_ts, "AUDIT_EVENT_KINDS"))

    def test_python_forbidden_keys_match_ts_audit_ts(self) -> None:
        self.assertEqual(
            set(FORBIDDEN_AUDIT_KEYS), _ts_array(self.audit_ts, "FORBIDDEN_AUDIT_KEYS")
        )

    def test_python_kinds_match_ts_union_type(self) -> None:
        start = self.types_ts.index("export type AuditEventKind")
        end = self.types_ts.index(";", start)
        union = set(re.findall(r"'([a-z_]+)'", self.types_ts[start:end]))
        self.assertEqual(set(AUDIT_EVENT_KINDS), union)

    def test_every_fixture_kind_is_accepted_and_unknown_refused(self) -> None:
        for kind in self.fixture["kinds"]:
            event = {
                "id": "audit_1",
                "familyId": "fam_1",
                "actorGuardianId": None,
                "kind": kind,
                "at": "2026-01-01T00:00:00.000Z",
                "subjectRef": None,
                "metadata": {},
            }
            self.assertTrue(validate_audit_event(event)["ok"], kind)
            event["kind"] = kind + "_unknown"
            self.assertEqual(validate_audit_event(event)["errorCode"], "invalid_kind")


if __name__ == "__main__":
    unittest.main()
