"""Convert queue store stubs. No ML, media, or embeddings.

Explicit fail-closed cases must stay. Skipping them when ML lands is a regression.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.jobs import (  # noqa: E402
    cancel_convert_job,
    complete_convert_job,
    fail_convert_job,
    get_family_job,
    list_family_convert_jobs,
    queue_convert_job_in_store,
    start_convert_job,
)
from familiar_convert.store import create_memory_store  # noqa: E402

AT = "2026-01-01T00:00:00.000Z"


def _enrollment(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "enr_1",
        "familyId": "fam_1",
        "guardianId": "grd_1",
        "consentRecordId": "cns_1",
        "modality": "voice_and_face",
        "status": "active",
        "artifactRef": None,
        "createdAt": AT,
        "revokedAt": None,
        "deletedAt": None,
    }
    base.update(overrides)
    return base


def _consent(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "cns_1",
        "familyId": "fam_1",
        "guardianId": "grd_1",
        "policyVersion": "stub-0",
        "grantedAt": AT,
        "revokedAt": None,
        "affirmationMethod": "explicit_ui",
        "scopes": ["voice_enrollment", "face_enrollment", "inference_on_family_content"],
    }
    base.update(overrides)
    return base


def _kid(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "id": "kid_1",
        "familyId": "fam_1",
        "displayName": "A",
        "managedByGuardianId": "grd_1",
        "createdAt": AT,
        "updatedAt": AT,
        "status": "active",
    }
    base.update(overrides)
    return base


def _store(**seed: object):
    return create_memory_store(
        enrollments=seed.get("enrollments", [_enrollment()]),
        consents=seed.get("consents", [_consent()]),
        kid_profiles=seed.get("kid_profiles", [_kid()]),
    )


class QueueConvertJobStoreTests(unittest.TestCase):
    def test_allows_explicit_in_family_target(self) -> None:
        store = _store()
        result = queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_a",
            target_enrollment_id="enr_1",
            source_ref="library:demo",
            at=AT,
            job_id="cvt_1",
        )
        self.assertTrue(result["ok"])
        job = result["value"]["job"]
        self.assertEqual(job["kind"], "convert")
        self.assertEqual(job["status"], "queued")
        self.assertEqual(job["targetEnrollmentId"], "enr_1")
        self.assertEqual(job["requestedByGuardianId"], "grd_a")
        self.assertEqual(result["value"]["intendedAudit"]["kind"], "convert_queued")

    def test_refuses_missing_target_enrollment(self) -> None:
        store = _store()
        result = queue_convert_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", target_enrollment_id=None
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["errorCode"], "missing_target_enrollment")
        self.assertEqual(list_family_convert_jobs(store, "fam_1"), [])

    def test_refuses_empty_target_enrollment(self) -> None:
        store = _store()
        result = queue_convert_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", target_enrollment_id="  "
        )
        self.assertEqual(result["errorCode"], "missing_target_enrollment")

    def test_refuses_revoked_enrollment(self) -> None:
        store = _store(enrollments=[_enrollment(status="revoked", revokedAt=AT)])
        result = queue_convert_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", target_enrollment_id="enr_1"
        )
        self.assertEqual(result["errorCode"], "convert_refused")
        self.assertEqual(result["intendedAudit"]["kind"], "convert_refused")
        self.assertEqual(list_family_convert_jobs(store, "fam_1"), [])

    def test_refuses_revoked_consent(self) -> None:
        store = _store(consents=[_consent(revokedAt=AT)])
        result = queue_convert_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", target_enrollment_id="enr_1"
        )
        self.assertEqual(result["errorCode"], "convert_refused")

    def test_refuses_wrong_family_enrollment(self) -> None:
        store = _store(enrollments=[_enrollment(familyId="fam_other")])
        result = queue_convert_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", target_enrollment_id="enr_1"
        )
        self.assertEqual(result["errorCode"], "convert_refused")

    def test_refuses_kid_profile_as_target(self) -> None:
        store = _store()
        result = queue_convert_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", target_enrollment_id="kid_1"
        )
        self.assertEqual(result["errorCode"], "kid_profile_not_target")

    def test_refuses_insufficient_inference_scope(self) -> None:
        store = _store(consents=[_consent(scopes=["voice_enrollment", "face_enrollment"])])
        result = queue_convert_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", target_enrollment_id="enr_1"
        )
        self.assertEqual(result["errorCode"], "convert_refused")

    def test_list_is_family_scoped(self) -> None:
        store = _store()
        store.put_consent(_consent(id="cns_2", familyId="fam_2", guardianId="grd_2"))
        store.put_enrollment(
            _enrollment(
                id="enr_2",
                familyId="fam_2",
                guardianId="grd_2",
                consentRecordId="cns_2",
            )
        )
        queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_fam1",
        )
        queue_convert_job_in_store(
            store,
            family_id="fam_2",
            guardian_id="grd_2",
            target_enrollment_id="enr_2",
            job_id="cvt_fam2",
        )
        listed = list_family_convert_jobs(store, "fam_1")
        self.assertEqual([job["id"] for job in listed], ["cvt_fam1"])

    def test_get_refuses_wrong_family(self) -> None:
        store = _store()
        queued = queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_1",
        )
        self.assertTrue(queued["ok"])
        result = get_family_job(store, "cvt_1", family_id="fam_other")
        self.assertEqual(result, {"ok": False, "errorCode": "wrong_family"})


class ConvertStatusStubTests(unittest.TestCase):
    def test_queued_running_needs_review(self) -> None:
        store = _store()
        queued = queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_1",
        )
        self.assertTrue(queued["ok"])
        running = start_convert_job(store, "cvt_1", family_id="fam_1")
        self.assertTrue(running["ok"])
        self.assertEqual(running["value"]["status"], "running")
        done = complete_convert_job(store, "cvt_1", family_id="fam_1")
        self.assertTrue(done["ok"])
        self.assertEqual(done["value"]["status"], "needs_review")

    def test_running_to_failed(self) -> None:
        store = _store()
        queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_1",
        )
        start_convert_job(store, "cvt_1", family_id="fam_1")
        failed = fail_convert_job(store, "cvt_1", family_id="fam_1", error_code="stub_failed")
        self.assertTrue(failed["ok"])
        self.assertEqual(failed["value"]["status"], "failed")
        self.assertEqual(failed["value"]["errorCode"], "stub_failed")

    def test_cancel_queued_and_running(self) -> None:
        store = _store()
        queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_q",
        )
        cancelled = cancel_convert_job(store, "cvt_q", family_id="fam_1")
        self.assertEqual(cancelled["value"]["status"], "cancelled")

        queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_r",
        )
        start_convert_job(store, "cvt_r", family_id="fam_1")
        cancelled_running = cancel_convert_job(store, "cvt_r", family_id="fam_1")
        self.assertEqual(cancelled_running["value"]["status"], "cancelled")

    def test_cancel_needs_review_is_refused(self) -> None:
        store = _store()
        queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_1",
        )
        start_convert_job(store, "cvt_1", family_id="fam_1")
        complete_convert_job(store, "cvt_1", family_id="fam_1")
        result = cancel_convert_job(store, "cvt_1", family_id="fam_1")
        self.assertEqual(result, {"ok": False, "errorCode": "illegal_job_status"})

    def test_complete_from_queued_is_refused(self) -> None:
        store = _store()
        queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_1",
        )
        result = complete_convert_job(store, "cvt_1", family_id="fam_1")
        self.assertEqual(result, {"ok": False, "errorCode": "illegal_job_status"})

    def test_start_wrong_family_is_refused(self) -> None:
        store = _store()
        queue_convert_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            target_enrollment_id="enr_1",
            job_id="cvt_1",
        )
        result = start_convert_job(store, "cvt_1", family_id="fam_other")
        self.assertEqual(result, {"ok": False, "errorCode": "wrong_family"})


if __name__ == "__main__":
    unittest.main()
