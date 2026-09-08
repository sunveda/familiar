"""HTTP integration stubs for ingest. Never streams or writes media."""

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
CONVERT_SRC = Path(__file__).resolve().parents[2] / "convert" / "src"
sys.path.insert(0, str(CONVERT_SRC))
sys.path.insert(0, str(ROOT))

from familiar_ingest.http import create_handler  # noqa: E402
from familiar_ingest.store import create_memory_store  # noqa: E402

AT = "2026-01-01T00:00:00.000Z"


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


class IngestHttpTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = create_memory_store(enrollments=[_enrollment()], consents=[_consent()])
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
        self.assertEqual(body["media"], "not_stored")

    def test_create_list_stage_family_scoped(self) -> None:
        status, created = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"sourceRef": "library:demo"},
            {"x-guardian-id": "grd_1"},
        )
        self.assertEqual(status, 201)
        job_id = created["job"]["id"]
        self.assertEqual(created["job"]["status"], "queued")
        self.assertEqual(created["media"], "not_stored")

        status, listed = self._json("GET", "/families/fam_1/jobs")
        self.assertEqual(status, 200)
        self.assertEqual([job["id"] for job in listed["jobs"]], [job_id])

        status, other = self._json("GET", "/families/fam_2/jobs")
        self.assertEqual(status, 200)
        self.assertEqual(other["jobs"], [])

        status, staged = self._json(
            "POST",
            f"/jobs/{job_id}/stage",
            {},
            {"x-family-id": "fam_1"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(staged["job"]["status"], "staged")

    def test_create_refuses_repo_path(self) -> None:
        status, body = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"sourceRef": "./media/foo.mp4"},
            {"x-guardian-id": "grd_1"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "invalid_source_ref")

    def test_get_wrong_family(self) -> None:
        _, created = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"sourceRef": "library:demo"},
            {"x-guardian-id": "grd_1"},
        )
        job_id = created["job"]["id"]
        status, body = self._json("GET", f"/jobs/{job_id}", headers={"x-family-id": "fam_other"})
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "wrong_family")

    def test_convert_requires_explicit_enrollment(self) -> None:
        _, created = self._json(
            "POST",
            "/families/fam_1/jobs",
            {"sourceRef": "s3://family-media/key"},
            {"x-guardian-id": "grd_1"},
        )
        job_id = created["job"]["id"]
        self._json("POST", f"/jobs/{job_id}/stage", {}, {"x-family-id": "fam_1"})

        status, missing = self._json(
            "POST",
            f"/jobs/{job_id}/convert",
            {},
            {"x-family-id": "fam_1", "x-guardian-id": "grd_1"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(missing["error"], "missing_target_enrollment")

        status, queued = self._json(
            "POST",
            f"/jobs/{job_id}/convert",
            {"targetEnrollmentId": "enr_1"},
            {"x-family-id": "fam_1", "x-guardian-id": "grd_a"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(queued["job"]["kind"], "convert")
        self.assertEqual(queued["job"]["targetEnrollmentId"], "enr_1")
        self.assertEqual(queued["intendedAudit"]["kind"], "convert_queued")


if __name__ == "__main__":
    unittest.main()
