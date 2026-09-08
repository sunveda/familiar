"""Ingest stub tests (stdlib unittest). No downloads, ffmpeg, or media I/O."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
CONVERT_SRC = Path(__file__).resolve().parents[2] / "convert" / "src"
sys.path.insert(0, str(CONVERT_SRC))
sys.path.insert(0, str(ROOT))

from familiar_ingest.jobs import (  # noqa: E402
    IngestError,
    create_ingest_job_in_store,
    fail_ingest_job,
    get_family_job,
    list_family_ingest_jobs,
    queue_convert_from_ingest,
    stage_ingest_job,
)
from familiar_ingest.main import IngestRequest, create_ingest_job  # noqa: E402
from familiar_ingest.source_ref import is_external_source_ref  # noqa: E402
from familiar_ingest.store import create_memory_store  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "packages" / "shared" / "fixtures" / "source-ref-cases.json"
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


def _staged_store(**seed: object):
    store = create_memory_store(
        enrollments=seed.get("enrollments", [_enrollment()]),
        consents=seed.get("consents", [_consent()]),
        kid_profiles=seed.get("kid_profiles", [_kid()]),
    )
    created = create_ingest_job_in_store(
        store,
        family_id="fam_1",
        guardian_id="grd_1",
        source_ref="library:demo",
        at=AT,
        job_id="ing_1",
    )
    assert created["ok"]
    staged = stage_ingest_job(store, "ing_1", family_id="fam_1", at=AT)
    assert staged["ok"]
    return store


class SourceRefTests(unittest.TestCase):
    def test_shared_fixture(self) -> None:
        data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.assertTrue(data["cases"])
        for case in data["cases"]:
            self.assertEqual(
                is_external_source_ref(case["sourceRef"]),
                case["expectOk"],
                msg=case["id"],
            )

    def test_refuses_repo_paths(self) -> None:
        self.assertFalse(is_external_source_ref("apps/ingest/clip.mp4"))
        self.assertFalse(is_external_source_ref("./media/foo.mp4"))
        self.assertFalse(is_external_source_ref("file:///workspace/media/x.mp4"))


class CreateIngestJobTests(unittest.TestCase):
    def test_queues_family_scoped_job(self) -> None:
        job = create_ingest_job(
            IngestRequest(family_id="fam_1", guardian_id="grd_1", source_ref="library:demo")
        )
        self.assertEqual(job["kind"], "ingest")
        self.assertEqual(job["status"], "queued")
        self.assertIsNone(job["targetEnrollmentId"])
        self.assertEqual(job["familyId"], "fam_1")

    def test_requires_family_and_guardian(self) -> None:
        with self.assertRaises(IngestError) as ctx:
            create_ingest_job(IngestRequest(family_id="", guardian_id="grd_1", source_ref="library:demo"))
        self.assertEqual(ctx.exception.error_code, "missing_family")

    def test_refuses_repo_path_source_ref(self) -> None:
        with self.assertRaises(IngestError) as ctx:
            create_ingest_job(
                IngestRequest(family_id="fam_1", guardian_id="grd_1", source_ref="media/foo.mp4")
            )
        self.assertEqual(ctx.exception.error_code, "invalid_source_ref")


class FamilyScopeAndStatusTests(unittest.TestCase):
    def test_list_is_family_scoped(self) -> None:
        store = create_memory_store()
        create_ingest_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", source_ref="library:a", job_id="a"
        )
        create_ingest_job_in_store(
            store, family_id="fam_2", guardian_id="grd_2", source_ref="library:b", job_id="b"
        )
        listed = list_family_ingest_jobs(store, "fam_1")
        self.assertEqual([job["id"] for job in listed], ["a"])

    def test_get_refuses_wrong_family(self) -> None:
        store = create_memory_store()
        create_ingest_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", source_ref="library:a", job_id="a"
        )
        result = get_family_job(store, "a", family_id="fam_other")
        self.assertEqual(result, {"ok": False, "errorCode": "wrong_family"})

    def test_queued_to_staged_without_media_files(self) -> None:
        store = create_memory_store()
        create_ingest_job_in_store(
            store,
            family_id="fam_1",
            guardian_id="grd_1",
            source_ref="https://cdn.example.invalid/v",
            job_id="ing_1",
        )
        result = stage_ingest_job(store, "ing_1", family_id="fam_1")
        self.assertTrue(result["ok"])
        self.assertEqual(result["value"]["status"], "staged")
        self.assertFalse((REPO_ROOT / "media").exists())
        self.assertEqual(list(REPO_ROOT.rglob("*.mp4")), [])
        self.assertEqual(list(REPO_ROOT.rglob("*.wav")), [])

    def test_queued_to_failed(self) -> None:
        store = create_memory_store()
        create_ingest_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", source_ref="library:demo", job_id="ing_1"
        )
        result = fail_ingest_job(store, "ing_1", family_id="fam_1")
        self.assertTrue(result["ok"])
        self.assertEqual(result["value"]["status"], "failed")
        self.assertEqual(result["value"]["errorCode"], "staging_failed")

    def test_stage_wrong_family_is_refused(self) -> None:
        store = create_memory_store()
        create_ingest_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", source_ref="library:demo", job_id="ing_1"
        )
        result = stage_ingest_job(store, "ing_1", family_id="fam_other")
        self.assertEqual(result, {"ok": False, "errorCode": "wrong_family"})

    def test_stage_refuses_already_staged(self) -> None:
        store = _staged_store()
        result = stage_ingest_job(store, "ing_1")
        self.assertEqual(result, {"ok": False, "errorCode": "illegal_job_status"})


class ConvertHandoffTests(unittest.TestCase):
    def test_queues_convert_with_explicit_active_enrollment(self) -> None:
        store = _staged_store()
        result = queue_convert_from_ingest(
            store, "ing_1", "enr_1", family_id="fam_1", actor_guardian_id="grd_a"
        )
        self.assertTrue(result["ok"])
        job = result["value"]["job"]
        self.assertEqual(job["kind"], "convert")
        self.assertEqual(job["status"], "queued")
        self.assertEqual(job["targetEnrollmentId"], "enr_1")
        self.assertEqual(job["sourceRef"], "library:demo")
        self.assertEqual(job["requestedByGuardianId"], "grd_a")
        self.assertEqual(result["value"]["intendedAudit"]["kind"], "convert_queued")

    def test_refuses_missing_target_enrollment_id(self) -> None:
        store = _staged_store()
        result = queue_convert_from_ingest(store, "ing_1", None, family_id="fam_1")
        self.assertEqual(result["errorCode"], "missing_target_enrollment")
        self.assertFalse(result["ok"])
        self.assertEqual(store.list_jobs("fam_1", kind="convert"), [])

    def test_refuses_empty_target_enrollment_id(self) -> None:
        store = _staged_store()
        result = queue_convert_from_ingest(store, "ing_1", "  ", family_id="fam_1")
        self.assertEqual(result["errorCode"], "missing_target_enrollment")

    def test_refuses_convert_before_staged(self) -> None:
        store = create_memory_store(enrollments=[_enrollment()], consents=[_consent()])
        create_ingest_job_in_store(
            store, family_id="fam_1", guardian_id="grd_1", source_ref="library:demo", job_id="ing_1"
        )
        result = queue_convert_from_ingest(store, "ing_1", "enr_1")
        self.assertEqual(result["errorCode"], "illegal_job_status")

    def test_refuses_missing_enrollment(self) -> None:
        store = _staged_store()
        result = queue_convert_from_ingest(store, "ing_1", "enr_missing")
        self.assertEqual(result["errorCode"], "convert_refused")
        self.assertEqual(result["intendedAudit"]["kind"], "convert_refused")

    def test_refuses_revoked_enrollment(self) -> None:
        store = _staged_store(
            enrollments=[_enrollment(status="revoked", revokedAt=AT)],
        )
        result = queue_convert_from_ingest(store, "ing_1", "enr_1")
        self.assertEqual(result["errorCode"], "convert_refused")

    def test_refuses_revoked_consent(self) -> None:
        store = _staged_store(consents=[_consent(revokedAt=AT)])
        result = queue_convert_from_ingest(store, "ing_1", "enr_1")
        self.assertEqual(result["errorCode"], "convert_refused")

    def test_refuses_wrong_family_on_handoff(self) -> None:
        store = _staged_store()
        result = queue_convert_from_ingest(store, "ing_1", "enr_1", family_id="fam_other")
        self.assertEqual(result["errorCode"], "wrong_family")

    def test_refuses_kid_profile_as_target(self) -> None:
        store = _staged_store()
        result = queue_convert_from_ingest(store, "ing_1", "kid_1")
        self.assertEqual(result["errorCode"], "kid_profile_not_target")

    def test_refuses_cross_family_enrollment(self) -> None:
        store = _staged_store(enrollments=[_enrollment(familyId="fam_other")])
        result = queue_convert_from_ingest(store, "ing_1", "enr_1")
        self.assertEqual(result["errorCode"], "convert_refused")

    def test_refuses_missing_inference_scope(self) -> None:
        store = _staged_store(
            consents=[_consent(scopes=["voice_enrollment", "face_enrollment"])],
        )
        result = queue_convert_from_ingest(store, "ing_1", "enr_1")
        self.assertEqual(result["errorCode"], "convert_refused")


if __name__ == "__main__":
    unittest.main()
