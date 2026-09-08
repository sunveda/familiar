"""HTTP integration stubs for convert. Never runs inference or streams media."""

from __future__ import annotations

import json
import sys
import threading
import unittest
from http.server import HTTPServer
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.http import create_handler  # noqa: E402
from familiar_convert.store import create_memory_store  # noqa: E402

AT = "2026-01-01T00:00:00.000Z"
STUB_AUTH = {"x-family-id": "fam_1", "x-guardian-id": "grd_1"}


def _enrollment() -> dict[str, Any]:
    return {
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


def _consent() -> dict[str, Any]:
    return {
        "id": "cns_1",
        "familyId": "fam_1",
        "guardianId": "grd_1",
        "policyVersion": "stub-0",
        "grantedAt": AT,
        "revokedAt": None,
        "affirmationMethod": "explicit_ui",
        "scopes": ["voice_enrollment", "face_enrollment", "inference_on_family_content"],
    }


def _kid() -> dict[str, Any]:
    return {
        "id": "kid_1",
        "familyId": "fam_1",
        "displayName": "A",
        "managedByGuardianId": "grd_1",
        "createdAt": AT,
        "updatedAt": AT,
        "status": "active",
    }


class ConvertHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = create_memory_store(
            enrollments=[_enrollment()],
            consents=[_consent()],
            kid_profiles=[_kid()],
        )
        handler = create_handler(self.store)
        self.server = HTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address[:2]
        self.base = f"http://{host}:{port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()

    def _json(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, Any]:
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = Request(f"{self.base}{path}", data=data, method=method)
        req.add_header("content-type", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with urlopen(req, timeout=5) as res:
                return res.status, json.loads(res.read().decode("utf-8"))
        except HTTPError as err:
            return err.code, json.loads(err.read().decode("utf-8"))

    def test_health(self) -> None:
        status, body = self._json("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["ml"], False)
        self.assertEqual(body["inference"], "not_run")
        self.assertEqual(body["media"], "not_processed")

    def test_queue_list_get_family_scoped(self) -> None:
        status, created = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "enr_1", "sourceRef": "library:demo"},
            {"x-family-id": "fam_1", "x-guardian-id": "grd_a"},
        )
        self.assertEqual(status, 201)
        job_id = created["job"]["id"]
        self.assertEqual(created["job"]["status"], "queued")
        self.assertEqual(created["job"]["targetEnrollmentId"], "enr_1")
        self.assertEqual(created["job"]["requestedByGuardianId"], "grd_a")
        self.assertEqual(created["intendedAudit"]["kind"], "convert_queued")
        self.assertEqual(created["ml"], False)

        status, listed = self._json("GET", "/families/fam_1/jobs", headers=STUB_AUTH)
        self.assertEqual(status, 200)
        self.assertEqual([job["id"] for job in listed["jobs"]], [job_id])

        status, other = self._json(
            "GET",
            "/families/fam_2/jobs",
            headers={"x-family-id": "fam_2", "x-guardian-id": "grd_2"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(other["jobs"], [])

        status, crossed = self._json("GET", "/families/fam_2/jobs", headers=STUB_AUTH)
        self.assertEqual(status, 403)
        self.assertEqual(crossed["error"], "wrong_family")

        status, crossed_post = self._json(
            "POST",
            "/families/fam_2/jobs",
            {"targetEnrollmentId": "enr_1"},
            STUB_AUTH,
        )
        self.assertEqual(status, 403)
        self.assertEqual(crossed_post["error"], "wrong_family")

        status, got = self._json("GET", f"/jobs/{job_id}", headers=STUB_AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(got["job"]["id"], job_id)

    def test_missing_stub_headers(self) -> None:
        status, body = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "enr_1"},
        )
        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "missing_guardian")

    def test_queue_refuses_missing_target(self) -> None:
        status, body = self._json("POST", "/families/fam_1/jobs", {}, STUB_AUTH)
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "missing_target_enrollment")

    def test_queue_refuses_kid_profile(self) -> None:
        status, body = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "kid_1"},
            STUB_AUTH,
        )
        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "kid_profile_not_target")

    def test_queue_refuses_unknown_enrollment(self) -> None:
        status, body = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "enr_missing"},
            STUB_AUTH,
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "convert_refused")
        self.assertEqual(body["intendedAudit"]["kind"], "convert_refused")

    def test_get_wrong_family(self) -> None:
        _, created = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "enr_1"},
            STUB_AUTH,
        )
        job_id = created["job"]["id"]
        status, body = self._json(
            "GET",
            f"/jobs/{job_id}",
            headers={"x-family-id": "fam_other", "x-guardian-id": "grd_1"},
        )
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "wrong_family")

    def test_run_complete_cancel(self) -> None:
        _, created = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "enr_1"},
            STUB_AUTH,
        )
        job_id = created["job"]["id"]

        status, running = self._json("POST", f"/jobs/{job_id}/run", {}, STUB_AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(running["job"]["status"], "running")

        status, done = self._json("POST", f"/jobs/{job_id}/complete", {}, STUB_AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(done["job"]["status"], "needs_review")

        status, cancel_review = self._json("POST", f"/jobs/{job_id}/cancel", {}, STUB_AUTH)
        self.assertEqual(status, 409)
        self.assertEqual(cancel_review["error"], "illegal_job_status")

        _, queued = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "enr_1"},
            STUB_AUTH,
        )
        cancel_id = queued["job"]["id"]
        status, cancelled = self._json("POST", f"/jobs/{cancel_id}/cancel", {}, STUB_AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(cancelled["job"]["status"], "cancelled")

    def test_run_fail(self) -> None:
        _, created = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"targetEnrollmentId": "enr_1"},
            STUB_AUTH,
        )
        job_id = created["job"]["id"]
        self._json("POST", f"/jobs/{job_id}/run", {}, STUB_AUTH)
        status, failed = self._json(
            "POST",
            f"/jobs/{job_id}/fail",
            {"errorCode": "stub_failed"},
            STUB_AUTH,
        )
        self.assertEqual(status, 200)
        self.assertEqual(failed["job"]["status"], "failed")
        self.assertEqual(failed["job"]["errorCode"], "stub_failed")


if __name__ == "__main__":
    unittest.main()
