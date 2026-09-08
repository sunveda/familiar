"""Fail-closed convert stub tests (stdlib unittest, no ML)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.pipeline import ConvertRefused, ConvertRequest, queue_convert_job


def _ok(**overrides: object) -> ConvertRequest:
    base: dict[str, object] = {
        "family_id": "fam_1",
        "guardian_id": "grd_1",
        "enrollment_id": "enr_1",
        "enrollment_family_id": "fam_1",
        "enrollment_status": "active",
        "consent_id": "cns_1",
        "consent_family_id": "fam_1",
        "consent_revoked": False,
        "consent_scopes": ("voice_enrollment", "face_enrollment", "inference_on_family_content"),
        "enrollment_consent_id": "cns_1",
    }
    base.update(overrides)
    return ConvertRequest(**base)  # type: ignore[arg-type]


class QueueConvertJobTests(unittest.TestCase):
    def test_allows_consented_active_enrollment(self) -> None:
        job = queue_convert_job(_ok())
        self.assertEqual(job["status"], "queued")
        self.assertEqual(job["targetEnrollmentId"], "enr_1")

    def test_refuses_missing_enrollment(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(enrollment_id=""))

    def test_refuses_cross_family_enrollment(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(enrollment_family_id="fam_other"))

    def test_refuses_revoked_consent(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(consent_revoked=True))

    def test_refuses_deleted_enrollment(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(enrollment_status="deleted"))


if __name__ == "__main__":
    unittest.main()
