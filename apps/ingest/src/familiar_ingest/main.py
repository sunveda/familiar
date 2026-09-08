"""Placeholder ingest API.

Does not fetch URLs, write files, or touch biometric data.
"""

from __future__ import annotations

from dataclasses import dataclass


class IngestError(ValueError):
    """Fail-closed ingest validation error."""


@dataclass(frozen=True)
class IngestRequest:
    family_id: str
    guardian_id: str
    source_ref: str


def create_ingest_job(request: IngestRequest) -> dict[str, str]:
    """Validate tenancy fields and return a queued job descriptor.

    Real implementations must stage media outside the git tree.
    """
    if not request.family_id or not request.guardian_id:
        raise IngestError("ingest requires family_id and guardian_id")
    if not request.source_ref:
        raise IngestError("ingest requires a source_ref")

    return {
        "kind": "ingest",
        "status": "queued",
        "familyId": request.family_id,
        "requestedByGuardianId": request.guardian_id,
        "sourceRef": request.source_ref,
        "targetEnrollmentId": "",
    }
