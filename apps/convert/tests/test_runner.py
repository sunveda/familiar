"""Runner tests: the backend must never be invoked when the gate fails.

Synthetic ids only. No media, models, or embeddings.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.backend import (  # noqa: E402
    ConvertBackend,
    MockBackend,
    StageContext,
    StageResult,
)
from familiar_convert.jobs import queue_convert_job_in_store  # noqa: E402
from familiar_convert.runner import run_convert_job  # noqa: E402
from familiar_convert.store import create_memory_store  # noqa: E402

AT = "2026-01-01T00:00:00.000Z"


class ExplodingBackend:
    """Any call is a test failure: proves the gate ran first."""

    name = "exploding"

    def __init__(self) -> None:
        self.calls = 0

    def voice_stage(self, ctx: StageContext) -> StageResult:
        self.calls += 1
        raise AssertionError("backend invoked")

    def face_stage(self, ctx: StageContext) -> StageResult:
        self.calls += 1
        raise AssertionError("backend invoked")


class RaisingBackend(MockBackend):
    def face_stage(self, ctx: StageContext) -> StageResult:
        raise RuntimeError("secret detail that must not leak")


class BadMetadataBackend(MockBackend):
    def voice_stage(self, ctx: StageContext) -> StageResult:
        return StageResult(stage="voice", backend="bad", metadata={"embedding": "x"})


class RevokeAfterVoiceBackend(MockBackend):
    def __init__(self, store) -> None:  # type: ignore[no-untyped-def]
        super().__init__()
        self.store = store

    def voice_stage(self, ctx: StageContext) -> StageResult:
        result = super().voice_stage(ctx)
        consent = self.store.get_consent("cns_1")
        consent["revokedAt"] = AT
        self.store.put_consent(consent)
        return result


def _enrollment(**o: object) -> dict[str, object]:
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
    base.update(o)
    return base


def _consent(**o: object) -> dict[str, object]:
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
    base.update(o)
    return base


def _queued_store():  # type: ignore[no-untyped-def]
    store = create_memory_store(
        enrollments=[_enrollment()],
        consents=[_consent()],
        kid_profiles=[
            {
                "id": "kid_1",
                "familyId": "fam_1",
                "displayName": "K",
                "managedByGuardianId": "grd_1",
                "createdAt": AT,
                "updatedAt": AT,
                "status": "active",
            }
        ],
    )
    queued = queue_convert_job_in_store(
        store,
        family_id="fam_1",
        guardian_id="grd_a",
        target_enrollment_id="enr_1",
        source_ref="library:demo",
        at=AT,
        job_id="cvt_1",
    )
    assert queued["ok"]
    return store


class RunnerHappyPathTests(unittest.TestCase):
    def test_mock_backend_runs_voice_then_face_to_needs_review(self) -> None:
        store = _queued_store()
        backend = MockBackend()
        self.assertIsInstance(backend, ConvertBackend)
        result = run_convert_job(store, "cvt_1", backend, family_id="fam_1", at=AT)
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["value"]["job"]["status"], "needs_review")
        self.assertEqual(backend.calls, [("voice", "cvt_1"), ("face", "cvt_1")])
        stages = result["value"]["stages"]
        self.assertEqual([s.stage for s in stages], ["voice", "face"])
        self.assertTrue(all(s.metadata["placeholder"] is True for s in stages))

    def test_mock_is_deterministic_and_metadata_only(self) -> None:
        a = run_convert_job(_queued_store(), "cvt_1", MockBackend(), family_id="fam_1", at=AT)
        b = run_convert_job(_queued_store(), "cvt_1", MockBackend(), family_id="fam_1", at=AT)
        self.assertEqual(a["value"]["stages"], b["value"]["stages"])
        for s in a["value"]["stages"]:
            for v in s.metadata.values():
                self.assertIsInstance(v, (str, int, float, bool, type(None)))
                self.assertNotIsInstance(v, (bytes, bytearray))


class GateBeforeBackendTests(unittest.TestCase):
    def _assert_refused(self, store, **run_kwargs) -> None:  # type: ignore[no-untyped-def]
        backend = ExplodingBackend()
        kwargs = {"family_id": "fam_1", "at": AT}
        kwargs.update(run_kwargs)
        result = run_convert_job(store, "cvt_1", backend, **kwargs)
        self.assertFalse(result["ok"], result)
        self.assertEqual(backend.calls, 0)
        self.assertEqual(result["errorCode"], "convert_refused")
        job = store.get_job("cvt_1")
        self.assertEqual(job["status"], "cancelled")
        self.assertEqual(job["errorCode"], "convert_refused")
        self.assertEqual(store.list_audits_by_job("cvt_1")[-1]["kind"], "convert_refused")

    def test_revoked_consent(self) -> None:
        store = _queued_store()
        store.put_consent(_consent(revokedAt=AT))
        self._assert_refused(store)

    def test_enrollment_revoked(self) -> None:
        store = _queued_store()
        store.put_enrollment(_enrollment(status="revoked", revokedAt=AT))
        self._assert_refused(store)

    def test_enrollment_deleted(self) -> None:
        store = _queued_store()
        store.put_enrollment(_enrollment(status="deleted", deletedAt=AT))
        self._assert_refused(store)

    def test_enrollment_pending(self) -> None:
        store = _queued_store()
        store.put_enrollment(_enrollment(status="pending"))
        self._assert_refused(store)

    def test_enrollment_other_family(self) -> None:
        store = _queued_store()
        store.put_enrollment(_enrollment(familyId="fam_other"))
        self._assert_refused(store)

    def test_consent_other_family(self) -> None:
        store = _queued_store()
        store.put_consent(_consent(familyId="fam_other"))
        self._assert_refused(store)

    def test_enrollment_not_bound_to_consent(self) -> None:
        store = _queued_store()
        # Stored consent row under key cns_1 carries a different id: not bound.
        store._consents["cns_1"]["id"] = "cns_other"  # noqa: SLF001
        self._assert_refused(store)

    def test_missing_inference_scope(self) -> None:
        store = _queued_store()
        store.put_consent(_consent(scopes=["voice_enrollment", "face_enrollment"]))
        self._assert_refused(store)

    def test_missing_target_enrollment_id(self) -> None:
        store = _queued_store()
        job = store.get_job("cvt_1")
        job["targetEnrollmentId"] = None
        store.put_job(job)
        self._assert_refused(store)

    def test_blank_target_enrollment_id(self) -> None:
        store = _queued_store()
        job = store.get_job("cvt_1")
        job["targetEnrollmentId"] = "  "
        store.put_job(job)
        self._assert_refused(store)

    def test_kid_profile_as_target(self) -> None:
        store = _queued_store()
        job = store.get_job("cvt_1")
        job["targetEnrollmentId"] = "kid_1"
        store.put_job(job)
        self._assert_refused(store)

    def test_enrollment_or_consent_missing(self) -> None:
        store = _queued_store()
        job = store.get_job("cvt_1")
        job["targetEnrollmentId"] = "enr_nope"
        store.put_job(job)
        self._assert_refused(store)
        store2 = _queued_store()
        store2.put_enrollment(_enrollment(consentRecordId="cns_nope"))
        self._assert_refused(store2)

    def test_abuse_hook_refusal_also_skips_backend(self) -> None:
        class Deny:
            def allow_queue(self, request) -> bool:  # type: ignore[no-untyped-def]
                return False

        self._assert_refused(_queued_store(), abuse_hook=Deny())

    def test_wrong_caller_family_never_reaches_backend(self) -> None:
        store = _queued_store()
        backend = ExplodingBackend()
        result = run_convert_job(store, "cvt_1", backend, family_id="fam_other", at=AT)
        self.assertEqual(result, {"ok": False, "errorCode": "wrong_family"})
        self.assertEqual(backend.calls, 0)
        self.assertEqual(store.get_job("cvt_1")["status"], "queued")

    def test_non_queued_job_never_reaches_backend(self) -> None:
        store = _queued_store()
        run_convert_job(store, "cvt_1", MockBackend(), family_id="fam_1", at=AT)
        backend = ExplodingBackend()
        result = run_convert_job(store, "cvt_1", backend, family_id="fam_1", at=AT)
        self.assertEqual(result, {"ok": False, "errorCode": "illegal_job_status"})
        self.assertEqual(backend.calls, 0)

    def test_unknown_job(self) -> None:
        backend = ExplodingBackend()
        result = run_convert_job(_queued_store(), "nope", backend, family_id="fam_1")
        self.assertEqual(result, {"ok": False, "errorCode": "not_found"})
        self.assertEqual(backend.calls, 0)

    def test_revoke_mid_run_blocks_face_stage(self) -> None:
        store = _queued_store()
        backend = RevokeAfterVoiceBackend(store)
        result = run_convert_job(store, "cvt_1", backend, family_id="fam_1", at=AT)
        self.assertFalse(result["ok"])
        self.assertEqual(backend.calls, [("voice", "cvt_1")])
        self.assertEqual(store.get_job("cvt_1")["status"], "cancelled")


class BackendFailureTests(unittest.TestCase):
    def test_backend_exception_fails_job_with_code_only(self) -> None:
        store = _queued_store()
        result = run_convert_job(store, "cvt_1", RaisingBackend(), family_id="fam_1", at=AT)
        self.assertEqual(result, {"ok": False, "errorCode": "backend_face_failed"})
        job = store.get_job("cvt_1")
        self.assertEqual(job["status"], "failed")
        self.assertEqual(job["errorCode"], "backend_face_failed")
        self.assertNotIn("secret", str(job))

    def test_backend_returning_forbidden_metadata_fails_job(self) -> None:
        store = _queued_store()
        run_convert_job(store, "cvt_1", BadMetadataBackend(), family_id="fam_1", at=AT)
        job = store.get_job("cvt_1")
        self.assertEqual(job["status"], "failed")
        self.assertEqual(job["errorCode"], "backend_voice_failed")


if __name__ == "__main__":
    unittest.main()
