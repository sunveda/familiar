"""Unit tests for stub auth / tenancy. Shared cases with TypeScript.

Production auth is blocked. These tests do not verify JWT/OIDC.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from familiar_ingest.auth import (  # noqa: E402
    AUTH_STUB_MODE,
    STUB_FAMILY_ID_HEADER,
    STUB_GUARDIAN_ID_HEADER,
    assert_same_family,
    http_status_for_auth_error,
    resolve_auth_context,
    resolve_auth_context_from_headers,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURE = REPO_ROOT / "packages" / "shared" / "fixtures" / "auth-tenancy-cases.json"


def _run_case(case: dict[str, object]) -> tuple[bool, str | None]:
    resolved = resolve_auth_context(
        guardian_id=case["guardianId"] if isinstance(case["guardianId"], str) else None,
        family_id=case["familyId"] if isinstance(case["familyId"], str) else None,
    )
    if not resolved["ok"]:
        return False, str(resolved["errorCode"])
    same = assert_same_family(resolved["context"], str(case["resourceFamilyId"]))
    if not same["ok"]:
        return False, str(same["errorCode"])
    return True, None


class AuthTenancyFixtureTests(unittest.TestCase):
    def test_shared_fixture(self) -> None:
        payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
        for case in payload["cases"]:
            with self.subTest(case["id"]):
                ok, error = _run_case(case)
                self.assertEqual(ok, case["expectOk"], case["id"])
                if case["expectOk"]:
                    self.assertIsNone(error)
                else:
                    self.assertEqual(error, case["expectError"])


class AuthTenancyExplicitTests(unittest.TestCase):
    def test_happy_path_mode_stub(self) -> None:
        resolved = resolve_auth_context(guardian_id="grd_1", family_id="fam_1")
        self.assertTrue(resolved["ok"])
        ctx = resolved["context"]
        self.assertEqual(ctx.guardian_id, "grd_1")
        self.assertEqual(ctx.family_id, "fam_1")
        self.assertEqual(ctx.mode, AUTH_STUB_MODE)
        self.assertEqual(
            ctx.as_dict(),
            {"guardianId": "grd_1", "familyId": "fam_1", "mode": "stub"},
        )

    def test_missing_headers(self) -> None:
        resolved = resolve_auth_context_from_headers({})
        self.assertEqual(resolved, {"ok": False, "errorCode": "missing_guardian"})

    def test_header_map_happy_path(self) -> None:
        resolved = resolve_auth_context_from_headers(
            {STUB_FAMILY_ID_HEADER: "fam_1", STUB_GUARDIAN_ID_HEADER: "grd_1"}
        )
        self.assertTrue(resolved["ok"])
        self.assertEqual(resolved["context"].family_id, "fam_1")
        self.assertEqual(resolved["context"].guardian_id, "grd_1")

    def test_assert_same_family_mismatch(self) -> None:
        resolved = resolve_auth_context(guardian_id="grd_1", family_id="fam_1")
        self.assertTrue(resolved["ok"])
        same = assert_same_family(resolved["context"], "fam_other")
        self.assertEqual(same, {"ok": False, "errorCode": "wrong_family"})
        self.assertEqual(assert_same_family(resolved["context"], "fam_1"), {"ok": True})

    def test_http_status_mapping(self) -> None:
        self.assertEqual(http_status_for_auth_error("missing_guardian"), 401)
        self.assertEqual(http_status_for_auth_error("missing_family"), 401)
        self.assertEqual(http_status_for_auth_error("wrong_family"), 403)


if __name__ == "__main__":
    unittest.main()
