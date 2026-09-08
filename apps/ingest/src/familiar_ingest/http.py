"""HTTP stubs for ingest jobs. No media streaming or downloads.

Stub tenancy headers match review-api: `x-family-id`, `x-guardian-id`.
Auth/IdP is out of scope.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import urlparse

from familiar_ingest.jobs import (
    create_ingest_job_in_store,
    fail_ingest_job,
    get_family_job,
    list_family_ingest_jobs,
    queue_convert_from_ingest,
    stage_ingest_job,
)
from familiar_ingest.store import IngestStore


def status_for_error(code: str) -> int:
    if code == "not_found":
        return 404
    if code == "wrong_family":
        return 403
    if code in {"illegal_job_status", "kid_profile_not_target"}:
        return 409
    if code in {
        "invalid_source_ref",
        "missing_family",
        "missing_guardian",
        "missing_target_enrollment",
        "convert_refused",
    }:
        return 400
    return 400


def _json(handler: BaseHTTPRequestHandler, status: int, body: Any) -> None:
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("content-type", "application/json")
    handler.send_header("content-length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


def _header(handler: BaseHTTPRequestHandler, name: str) -> str | None:
    raw = handler.headers.get(name)
    if raw is None or raw == "":
        return None
    return raw


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


def create_handler(store: IngestStore) -> type[BaseHTTPRequestHandler]:
    class IngestHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:  # noqa: A002
            return

        def do_GET(self) -> None:  # noqa: N802
            path = urlparse(self.path).path.rstrip("/") or "/"
            family_id = _header(self, "x-family-id")

            if path == "/health":
                _json(
                    self,
                    200,
                    {"ok": True, "service": "ingest", "ml": False, "media": "not_stored"},
                )
                return

            family_jobs = _match(path, "/families/", "/jobs")
            if family_jobs is not None:
                listed = list_family_ingest_jobs(store, family_jobs)
                _json(self, 200, {"familyId": family_jobs, "jobs": listed, "media": "not_stored"})
                return

            job_id = _match_prefix(path, "/jobs/")
            if job_id is not None and "/" not in job_id:
                result = get_family_job(store, job_id, family_id)
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": job_id},
                    )
                    return
                _json(self, 200, result["value"])
                return

            _json(self, 404, {"error": "not_found"})

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path.rstrip("/") or "/"
            family_id_header = _header(self, "x-family-id")
            guardian_id = _header(self, "x-guardian-id")
            body = _read_json(self)

            family_create = _match(path, "/families/", "/jobs")
            if family_create is not None:
                source_ref = str(body.get("sourceRef") or "")
                result = create_ingest_job_in_store(
                    store,
                    family_id=family_create,
                    guardian_id=guardian_id or "",
                    source_ref=source_ref,
                )
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "familyId": family_create},
                    )
                    return
                _json(self, 201, {"job": result["value"], "media": "not_stored"})
                return

            stage_id = _match_suffix(path, "/stage")
            if stage_id is not None:
                result = stage_ingest_job(store, stage_id, family_id=family_id_header)
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": stage_id},
                    )
                    return
                _json(self, 200, {"job": result["value"], "media": "not_stored"})
                return

            fail_id = _match_suffix(path, "/fail")
            if fail_id is not None:
                result = fail_ingest_job(
                    store,
                    fail_id,
                    family_id=family_id_header,
                    error_code=str(body.get("errorCode") or "staging_failed"),
                )
                if not result["ok"]:
                    _json(
                        self,
                        status_for_error(result["errorCode"]),
                        {"error": result["errorCode"], "jobId": fail_id},
                    )
                    return
                _json(self, 200, {"job": result["value"], "media": "not_stored"})
                return

            convert_id = _match_suffix(path, "/convert")
            if convert_id is not None:
                raw_target = body.get("targetEnrollmentId")
                target = None if raw_target is None else str(raw_target)
                result = queue_convert_from_ingest(
                    store,
                    convert_id,
                    target,
                    family_id=family_id_header,
                    actor_guardian_id=guardian_id,
                )
                if not result["ok"]:
                    payload: dict[str, Any] = {
                        "error": result["errorCode"],
                        "jobId": convert_id,
                    }
                    if "intendedAudit" in result:
                        payload["intendedAudit"] = result["intendedAudit"]
                    _json(self, status_for_error(result["errorCode"]), payload)
                    return
                _json(self, 200, result["value"])
                return

            _json(self, 404, {"error": "not_found"})

    return IngestHandler


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
