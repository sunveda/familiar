"""HTTP stubs for convert jobs. No inference, media streaming, or models.

Stub tenancy: shared `resolve_auth_context_from_headers` (x-family-id /
x-guardian-id). Production auth is blocked — not an IdP/OIDC/JWT verifier.
No secrets. Family isolation: assert_same_family (fail closed).
See docs/auth-tenancy.md.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import urlparse

from familiar_convert.auth import (
    AuthContext,
    assert_same_family,
    http_status_for_auth_error,
    resolve_auth_context_from_headers,
)
from familiar_convert.jobs import (
    cancel_convert_job,
    complete_convert_job,
    fail_convert_job,
    get_family_job,
    list_family_convert_jobs,
    queue_convert_job_in_store,
    start_convert_job,
)
from familiar_convert.store import ConvertStore


def status_for_error(code: str) -> int:
    if code in {"missing_family", "missing_guardian"}:
        return http_status_for_auth_error(code)
    if code == "not_found":
        return 404
    if code == "wrong_family":
        return 403
    if code in {"illegal_job_status", "kid_profile_not_target"}:
        return 409
    if code in {"missing_target_enrollment", "convert_refused"}:
        return 400
    return 400


def _json(handler: BaseHTTPRequestHandler, status: int, body: Any) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def _read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length_raw = handler.headers.get("Content-Length", "0")
    try:
        length = int(length_raw)
    except ValueError:
        length = 0
    raw = handler.rfile.read(length) if length > 0 else b""
    if not raw:
        return {}
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        return {}
    return data


def _require_stub_auth(handler: BaseHTTPRequestHandler) -> AuthContext | None:
    # Claimed headers only. No JWT/OIDC verification (production auth is blocked).
    result = resolve_auth_context_from_headers(handler.headers)
    if not result["ok"]:
        _json(handler, http_status_for_auth_error(str(result["errorCode"])), {"error": result["errorCode"]})
        return None
    ctx = result["context"]
    assert isinstance(ctx, AuthContext)
    return ctx


def create_handler(store: ConvertStore) -> type[BaseHTTPRequestHandler]:
    class ConvertHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            return

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path.rstrip("/") or "/"

            if path == "/health":
                _json(
                    self,
                    200,
                    {
                        "ok": True,
                        "service": "convert",
                        "ml": False,
                        "inference": "not_run",
                        "media": "not_processed",
                    },
                )
                return

            ctx = _require_stub_auth(self)
            if ctx is None:
                return

            family_jobs = _match(path, "/families/", "/jobs")
            if family_jobs is not None:
                same = assert_same_family(ctx, family_jobs)
                if not same["ok"]:
                    _json(self, 403, {"error": "wrong_family", "familyId": family_jobs})
                    return
                listed = list_family_convert_jobs(store, ctx.family_id)
                _json(
                    self,
                    200,
                    {
                        "familyId": ctx.family_id,
                        "jobs": listed,
                        "ml": False,
                        "inference": "not_run",
                    },
                )
                return

            job_id = _match_prefix(path, "/jobs/")
            if job_id is not None and "/" not in job_id:
                result = get_family_job(store, job_id, ctx.family_id)
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": job_id},
                    )
                    return
                _json(self, 200, {"job": result["value"], "ml": False, "inference": "not_run"})
                return

            _json(self, 404, {"error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path.rstrip("/") or "/"
            ctx = _require_stub_auth(self)
            if ctx is None:
                return
            body = _read_json(self)

            family_create = _match(path, "/families/", "/jobs")
            if family_create is not None:
                same = assert_same_family(ctx, family_create)
                if not same["ok"]:
                    _json(self, 403, {"error": "wrong_family", "familyId": family_create})
                    return
                raw_target = body.get("targetEnrollmentId")
                target = None if raw_target is None else str(raw_target)
                raw_source = body.get("sourceRef")
                source_ref = None if raw_source is None else str(raw_source)
                result = queue_convert_job_in_store(
                    store,
                    family_id=ctx.family_id,
                    guardian_id=ctx.guardian_id,
                    target_enrollment_id=target,
                    source_ref=source_ref,
                )
                if not result["ok"]:
                    payload: dict[str, Any] = {
                        "error": result["errorCode"],
                        "familyId": ctx.family_id,
                    }
                    if "intendedAudit" in result:
                        payload["intendedAudit"] = result["intendedAudit"]
                    _json(self, status_for_error(result["errorCode"]), payload)
                    return
                _json(
                    self,
                    201,
                    {**result["value"], "ml": False, "inference": "not_run"},
                )
                return

            run_id = _match_suffix(path, "/run")
            if run_id is not None:
                result = start_convert_job(store, run_id, family_id=ctx.family_id)
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": run_id},
                    )
                    return
                _json(self, 200, {"job": result["value"], "ml": False, "inference": "not_run"})
                return

            complete_id = _match_suffix(path, "/complete")
            if complete_id is not None:
                result = complete_convert_job(store, complete_id, family_id=ctx.family_id)
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": complete_id},
                    )
                    return
                _json(self, 200, {"job": result["value"], "ml": False, "inference": "not_run"})
                return

            fail_id = _match_suffix(path, "/fail")
            if fail_id is not None:
                result = fail_convert_job(
                    store,
                    fail_id,
                    family_id=ctx.family_id,
                    error_code=str(body.get("errorCode") or "convert_failed"),
                )
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": fail_id},
                    )
                    return
                _json(self, 200, {"job": result["value"], "ml": False, "inference": "not_run"})
                return

            cancel_id = _match_suffix(path, "/cancel")
            if cancel_id is not None:
                result = cancel_convert_job(store, cancel_id, family_id=ctx.family_id)
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": cancel_id},
                    )
                    return
                _json(self, 200, {"job": result["value"], "ml": False, "inference": "not_run"})
                return

            _json(self, 404, {"error": "not_found"})

    return ConvertHandler


def _match(path: str, prefix: str, suffix: str) -> str | None:
    if not path.startswith(prefix) or not path.endswith(suffix):
        return None
    mid = path[len(prefix) : -len(suffix)]
    if not mid or "/" in mid:
        return None
    return mid


def _match_prefix(path: str, prefix: str) -> str | None:
    if not path.startswith(prefix):
        return None
    rest = path[len(prefix) :]
    return rest or None


def _match_suffix(path: str, suffix: str) -> str | None:
    marker = "/jobs/"
    if not path.startswith(marker) or not path.endswith(suffix):
        return None
    mid = path[len(marker) : -len(suffix)]
    if not mid or "/" in mid:
        return None
    return mid
