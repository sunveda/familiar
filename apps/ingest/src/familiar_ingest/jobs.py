"""Family-scoped ingest job stubs.

No downloads, ffmpeg, or media writes. Convert handoff uses the Python
mirror of canonical TS `convertJobMayRun` (`queue_convert_job`).
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from familiar_ingest.auth import resolve_auth_context
from familiar_ingest.source_ref import is_external_source_ref
from familiar_ingest.store import IngestStore, Job

_CONVERT_SRC = Path(__file__).resolve().parents[3] / "convert" / "src"
if str(_CONVERT_SRC) not in sys.path:
    sys.path.insert(0, str(_CONVERT_SRC))

from familiar_convert.pipeline import (  # noqa: E402
    ConvertRefused,
    ConvertRequest,
    queue_convert_job,
)

JobResult = dict[str, Any]


class IngestError(ValueError):
    """Fail-closed ingest validation error."""

    def __init__(self, message: str, error_code: str = "invalid_request") -> None:
        super().__init__(message)
        self.error_code = error_code


def _fail(error_code: str) -> JobResult:
    return {"ok": False, "errorCode": error_code}


def _ok(value: Any) -> JobResult:
    return {"ok": True, "value": value}


def _now(at: str | None) -> str:
    return at if at is not None else "2026-01-01T00:00:00.000Z"


def create_ingest_job_in_store(
    store: IngestStore,
    *,
    family_id: str,
    guardian_id: str,
    source_ref: str,
    at: str | None = None,
    job_id: str | None = None,
) -> JobResult:
    """Register an opaque external sourceRef. Does not fetch or write media."""
    auth = resolve_auth_context(guardian_id=guardian_id, family_id=family_id)
    if not auth["ok"]:
        return _fail(str(auth["errorCode"]))
    ctx = auth["context"]
    family_id = ctx.family_id
    guardian_id = ctx.guardian_id
    if not is_external_source_ref(source_ref):
        return _fail("invalid_source_ref")

    stamp = _now(at)
    job: Job = {
        "id": job_id or store.next_id("ingest"),
        "familyId": family_id,
        "requestedByGuardianId": guardian_id,
        "kind": "ingest",
        "status": "queued",
        "targetEnrollmentId": None,
        "sourceRef": source_ref.strip(),
        "createdAt": stamp,
        "updatedAt": stamp,
        "errorCode": None,
    }
    store.put_job(job)
    return _ok(job)


def list_family_ingest_jobs(store: IngestStore, family_id: str) -> list[Job]:
    return store.list_jobs(family_id, kind="ingest")


def get_family_job(store: IngestStore, job_id: str, family_id: str | None = None) -> JobResult:
    job = store.get_job(job_id)
    if not job:
        return _fail("not_found")
    if family_id is not None and job["familyId"] != family_id:
        return _fail("wrong_family")
    return _ok(job)


def stage_ingest_job(
    store: IngestStore,
    job_id: str,
    *,
    family_id: str | None = None,
    at: str | None = None,
) -> JobResult:
    """queued → staged. No network download, ffmpeg, or files in the git tree."""
    job = store.get_job(job_id)
    if not job:
        return _fail("not_found")
    if job.get("kind") != "ingest":
        return _fail("not_found")
    if family_id is not None and job["familyId"] != family_id:
        return _fail("wrong_family")
    if job["status"] != "queued":
        return _fail("illegal_job_status")
    if not is_external_source_ref(str(job.get("sourceRef") or "")):
        return _fail("invalid_source_ref")

    next_job = dict(job)
    next_job["status"] = "staged"
    next_job["updatedAt"] = _now(at)
    store.put_job(next_job)
    return _ok(next_job)


def fail_ingest_job(
    store: IngestStore,
    job_id: str,
    *,
    family_id: str | None = None,
    error_code: str = "staging_failed",
    at: str | None = None,
) -> JobResult:
    """queued → failed. Stub failure path (no real staging I/O)."""
    job = store.get_job(job_id)
    if not job:
        return _fail("not_found")
    if job.get("kind") != "ingest":
        return _fail("not_found")
    if family_id is not None and job["familyId"] != family_id:
        return _fail("wrong_family")
    if job["status"] != "queued":
        return _fail("illegal_job_status")

    next_job = dict(job)
    next_job["status"] = "failed"
    next_job["errorCode"] = error_code
    next_job["updatedAt"] = _now(at)
    store.put_job(next_job)
    return _ok(next_job)


def _intended_audit(
    kind: str,
    job: Job,
    actor_guardian_id: str | None,
    at: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": f"audit_intended_{kind}_{job['id']}",
        "familyId": job["familyId"],
        "actorGuardianId": actor_guardian_id,
        "kind": kind,
        "at": at,
        "subjectRef": job["id"],
        "metadata": metadata,
    }


def queue_convert_from_ingest(
    store: IngestStore,
    ingest_job_id: str,
    target_enrollment_id: str | None,
    *,
    family_id: str | None = None,
    actor_guardian_id: str | None = None,
    at: str | None = None,
) -> JobResult:
    """Create a convert job only with explicit targetEnrollmentId + gate pass.

    Uses Python `queue_convert_job` (mirror of TS `convertJobMayRun`).
    KidProfile ids are never enrollment targets.
    """
    ingest_job = store.get_job(ingest_job_id)
    if not ingest_job or ingest_job.get("kind") != "ingest":
        return _fail("not_found")
    if family_id is not None and ingest_job["familyId"] != family_id:
        return _fail("wrong_family")
    if ingest_job["status"] != "staged":
        return _fail("illegal_job_status")

    target = (target_enrollment_id or "").strip()
    if not target:
        return _fail("missing_target_enrollment")

    kid = store.get_kid_profile(target)
    if kid is not None:
        return _fail("kid_profile_not_target")

    stamp = _now(at)
    actor = actor_guardian_id or str(ingest_job["requestedByGuardianId"])
    enrollment = store.get_enrollment(target)
    if enrollment is None:
        refused_job = {
            "id": store.next_id("convert"),
            "familyId": ingest_job["familyId"],
            "requestedByGuardianId": actor,
            "kind": "convert",
            "status": "queued",
            "targetEnrollmentId": target,
            "sourceRef": ingest_job.get("sourceRef"),
            "createdAt": stamp,
            "updatedAt": stamp,
            "errorCode": "convert_refused",
        }
        event = _intended_audit(
            "convert_refused",
            refused_job,
            actor,
            stamp,
            {"reason": "enrollment_missing", "ingestJobId": ingest_job_id, "targetEnrollmentId": target},
        )
        store.record_intended_audit(event)
        return {**_fail("convert_refused"), "intendedAudit": event}

    consent_id = str(enrollment.get("consentRecordId") or "")
    consent = store.get_consent(consent_id)
    if consent is None:
        event = _intended_audit(
            "convert_refused",
            ingest_job,
            actor,
            stamp,
            {"reason": "consent_missing", "ingestJobId": ingest_job_id, "targetEnrollmentId": target},
        )
        store.record_intended_audit(event)
        return {**_fail("convert_refused"), "intendedAudit": event}

    request = ConvertRequest(
        family_id=str(ingest_job["familyId"]),
        guardian_id=actor,
        enrollment_id=str(enrollment["id"]),
        enrollment_family_id=str(enrollment["familyId"]),
        enrollment_status=str(enrollment["status"]),
        consent_id=str(consent["id"]),
        consent_family_id=str(consent["familyId"]),
        consent_revoked=consent.get("revokedAt") is not None,
        consent_scopes=tuple(consent.get("scopes") or ()),
        enrollment_consent_id=str(enrollment.get("consentRecordId") or ""),
    )

    try:
        queued = queue_convert_job(request)
    except ConvertRefused:
        event = _intended_audit(
            "convert_refused",
            ingest_job,
            actor,
            stamp,
            {"reason": "convertJobMayRun", "ingestJobId": ingest_job_id, "targetEnrollmentId": target},
        )
        store.record_intended_audit(event)
        return {**_fail("convert_refused"), "intendedAudit": event}

    convert_job: Job = {
        "id": store.next_id("convert"),
        "familyId": queued["familyId"],
        "requestedByGuardianId": queued["requestedByGuardianId"],
        "kind": "convert",
        "status": queued["status"],
        "targetEnrollmentId": queued["targetEnrollmentId"],
        "sourceRef": ingest_job.get("sourceRef"),
        "createdAt": stamp,
        "updatedAt": stamp,
        "errorCode": None,
    }
    store.put_job(convert_job)
    event = _intended_audit(
        "convert_queued",
        convert_job,
        actor,
        stamp,
        {"ingestJobId": ingest_job_id, "targetEnrollmentId": target},
    )
    store.record_intended_audit(event)
    return _ok({"job": convert_job, "intendedAudit": event})
