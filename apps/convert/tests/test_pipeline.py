"""Fail-closed convert stub tests (stdlib unittest, no ML).

Explicit cases below must stay. Skipping them when ML lands is a regression.
Shared table: packages/shared/fixtures/convert-gate-cases.json
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.pipeline import (  # noqa: E402
    ConvertRefused,
    ConvertRequest,
    DisabledConvertAbuseHook,
    queue_convert_job,
)

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "shared"
    / "fixtures"
    / "convert-gate-cases.json"
)


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


def _request_from_case(case: dict[str, object]) -> ConvertRequest:
    job = case["job"]  # type: ignore[assignment]
    enrollment = case["enrollment"]  # type: ignore[assignment]
    consent = case["consent"]  # type: ignore[assignment]
    assert isinstance(job, dict)
    assert isinstance(enrollment, dict)
    assert isinstance(consent, dict)
    target = job.get("targetEnrollmentId")
    revoked_at = consent.get("revokedAt")
    return ConvertRequest(
        family_id=str(job["familyId"]),
        guardian_id=str(job["requestedByGuardianId"]),
        enrollment_id="" if target is None else str(target),
        enrollment_family_id=str(enrollment["familyId"]),
        enrollment_status=str(enrollment["status"]),
        consent_id=str(consent["id"]),
        consent_family_id=str(consent["familyId"]),
        consent_revoked=revoked_at is not None,
        consent_scopes=tuple(consent["scopes"]),  # type: ignore[arg-type]
        enrollment_consent_id=str(enrollment["consentRecordId"]),
    )


class AlwaysAllowHook:
    def allow_queue(self, request: ConvertRequest) -> bool:
        return True


class AlwaysDenyHook:
    def allow_queue(self, request: ConvertRequest) -> bool:
        return False


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

    def test_refuses_revoked_enrollment(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(enrollment_status="revoked"))

    def test_refuses_missing_inference_scope(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(consent_scopes=("voice_enrollment", "face_enrollment")))

    def test_allows_same_family_guardian_a_targeting_guardian_b(self) -> None:
        job = queue_convert_job(_ok(guardian_id="grd_a"))
        self.assertEqual(job["status"], "queued")
        self.assertEqual(job["requestedByGuardianId"], "grd_a")
        self.assertEqual(job["targetEnrollmentId"], "enr_1")

    def test_consent_fail_closed_wins_over_allowing_abuse_hook(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(consent_revoked=True), abuse_hook=AlwaysAllowHook())

    def test_disabled_hook_does_not_block_consented_job(self) -> None:
        job = queue_convert_job(_ok(), abuse_hook=DisabledConvertAbuseHook())
        self.assertEqual(job["status"], "queued")

    def test_hook_may_refuse_only_after_consent_passes(self) -> None:
        with self.assertRaises(ConvertRefused):
            queue_convert_job(_ok(), abuse_hook=AlwaysDenyHook())


class SharedFixtureTests(unittest.TestCase):
    def test_python_cases_match_shared_fixture(self) -> None:
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.assertTrue(data["cases"])
        for case in data["cases"]:
            if "python" not in case["appliesTo"]:
                continue
            request = _request_from_case(case)
            if case["expectMayRun"]:
                queued = queue_convert_job(request)
                self.assertEqual(queued["status"], "queued", msg=case["id"])
            else:
                with self.assertRaises(ConvertRefused, msg=case["id"]):
                    queue_convert_job(request)


if __name__ == "__main__":
    unittest.main()
