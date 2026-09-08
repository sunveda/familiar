"""In-memory convert audit adapter. Metadata only; no biometrics."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.audit import AuditLog, validate_audit_event  # noqa: E402

AT = "2026-01-01T00:00:00.000Z"


def _event(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "audit_1",
        "familyId": "fam_1",
        "actorGuardianId": "grd_1",
        "kind": "convert_queued",
        "at": AT,
        "subjectRef": "cvt_1",
        "metadata": {"targetEnrollmentId": "enr_1"},
    }
    base.update(overrides)
    return base


class AuditLogTests(unittest.TestCase):
    def test_rejects_forbidden_biometric_keys(self) -> None:
        log = AuditLog()
        result = log.append(_event(metadata={"embedding": "nope"}))
        self.assertFalse(result["ok"])
        self.assertEqual(result["errorCode"], "forbidden_payload")
        self.assertEqual(log.list_by_family("fam_1"), [])

    def test_rejects_faceBytes_and_privateKey(self) -> None:
        self.assertEqual(
            validate_audit_event(_event(metadata={"faceBytes": "x"}))["errorCode"],
            "forbidden_payload",
        )
        self.assertEqual(
            validate_audit_event(_event(metadata={"privateKey": "x"}))["errorCode"],
            "forbidden_payload",
        )

    def test_list_by_family_never_returns_other_families(self) -> None:
        log = AuditLog()
        self.assertTrue(log.append(_event())["ok"])
        self.assertTrue(
            log.append(_event(id="audit_2", familyId="fam_2", subjectRef="cvt_2"))["ok"]
        )
        fam1 = log.list_by_family("fam_1")
        self.assertEqual(len(fam1), 1)
        self.assertEqual(fam1[0]["familyId"], "fam_1")
        self.assertEqual(log.list_by_family("fam_other"), [])
        self.assertFalse(any(item["familyId"] == "fam_2" for item in fam1))


if __name__ == "__main__":
    unittest.main()
