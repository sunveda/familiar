"""Server entry point: bind policy, health, stub-auth fail-closed, no media."""

from __future__ import annotations

import json
import sys
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_convert.server import (  # noqa: E402
    UnsafeBindError,
    create_server,
    resolve_bind,
)

AUTH = {"x-family-id": "fam_1", "x-guardian-id": "grd_1"}


class ResolveBindTests(unittest.TestCase):
    def test_defaults_to_loopback(self) -> None:
        self.assertEqual(resolve_bind({}), ("127.0.0.1", 8001))

    def test_refuses_non_loopback_by_default(self) -> None:
        for host in ("0.0.0.0", "192.168.1.5", "example.com", "::"):
            with self.assertRaises(UnsafeBindError, msg=host):
                resolve_bind({"FAMILIAR_CONVERT_HOST": host})

    def test_non_loopback_requires_explicit_opt_in(self) -> None:
        env = {"FAMILIAR_CONVERT_HOST": "0.0.0.0", "FAMILIAR_ALLOW_NON_LOOPBACK": "1"}
        self.assertEqual(resolve_bind(env)[0], "0.0.0.0")
        with self.assertRaises(UnsafeBindError):
            resolve_bind({**env, "FAMILIAR_ALLOW_NON_LOOPBACK": "true"})

    def test_bad_ports_fail(self) -> None:
        for port in ("abc", "-1", "70000", ""):
            with self.assertRaises(ValueError, msg=port):
                resolve_bind({"FAMILIAR_CONVERT_PORT": port})


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = create_server("127.0.0.1", 0)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()

    def _get(self, path: str, headers: dict[str, str] | None = None) -> tuple[int, dict]:
        try:
            with urlopen(Request(self.base + path, headers=headers or {})) as res:
                return res.status, json.loads(res.read())
        except HTTPError as err:
            return err.code, json.loads(err.read())

    def _post(
        self, path: str, body: bytes, headers: dict[str, str] | None = None
    ) -> tuple[int, dict]:
        req = Request(self.base + path, data=body, method="POST", headers=headers or {})
        try:
            with urlopen(req) as res:
                return res.status, json.loads(res.read())
        except HTTPError as err:
            return err.code, json.loads(err.read())

    def test_health_is_public_and_reports_no_ml(self) -> None:
        status, body = self._get("/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertFalse(body["ml"])

    def test_family_routes_require_stub_headers(self) -> None:
        status, _ = self._get("/families/fam_1/jobs")
        self.assertEqual(status, 401)
        status, _ = self._get("/families/fam_1/jobs", {"x-family-id": "fam_1"})
        self.assertEqual(status, 401)

    def test_cross_family_is_403(self) -> None:
        status, body = self._get("/families/fam_2/jobs", AUTH)
        self.assertEqual(status, 403)
        self.assertEqual(body["error"], "wrong_family")

    def test_family_list_ok_and_empty(self) -> None:
        status, body = self._get("/families/fam_1/jobs", AUTH)
        self.assertEqual(status, 200)
        self.assertEqual(body["jobs"], [])

    def test_unknown_route_and_unknown_job_fail_closed(self) -> None:
        self.assertEqual(self._get("/nope", AUTH)[0], 404)
        self.assertEqual(self._get("/nope")[0], 401)
        self.assertEqual(self._get("/jobs/job_missing", AUTH)[0], 404)

    def test_no_media_routes(self) -> None:
        for path in ("/jobs/j/media", "/jobs/j/preview", "/media", "/files"):
            self.assertEqual(self._get(path, AUTH)[0], 404, path)

    def test_malformed_json_post_does_not_crash_and_is_refused(self) -> None:
        status, body = self._post(
            "/families/fam_1/jobs", b"{not json", {**AUTH, "content-type": "application/json"}
        )
        self.assertEqual(status, 400)
        self.assertIn("error", body)
        # Server still healthy afterwards.
        self.assertEqual(self._get("/health")[0], 200)


if __name__ == "__main__":
    unittest.main()
