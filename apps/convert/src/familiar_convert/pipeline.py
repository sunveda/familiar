"""Placeholder convert gate.

Refuses jobs that lack family-scoped active enrollment and unrevoked consent.
Does not call ML, load weights, or read biometric files.
"""

from __future__ import annotations

from dataclasses import dataclass


class ConvertRefused(PermissionError):
    """Job cannot run: consent or enrollment check failed."""


@dataclass(frozen=True)
class ConvertRequest:
    family_id: str
    guardian_id: str
    enrollment_id: str
    enrollment_family_id: str
    enrollment_status: str
    consent_id: str
    consent_family_id: str
    consent_revoked: bool
    consent_scopes: tuple[str, ...]
    enrollment_consent_id: str


def queue_convert_job(request: ConvertRequest) -> dict[str, str]:
    """Return a queued convert descriptor or raise ConvertRefused."""
    if not request.enrollment_id:
        raise ConvertRefused("inference requires an enrolled identity")
    if request.family_id != request.enrollment_family_id:
        raise ConvertRefused("enrollment is not in this family")
    if request.family_id != request.consent_family_id:
        raise ConvertRefused("consent is not in this family")
    if request.enrollment_consent_id != request.consent_id:
        raise ConvertRefused("enrollment is not bound to this consent record")
    if request.consent_revoked:
        raise ConvertRefused("consent has been revoked")
    if request.enrollment_status != "active":
        raise ConvertRefused("enrollment is not active (revoked or deleted)")
    if "inference_on_family_content" not in request.consent_scopes:
        raise ConvertRefused("consent does not include inference")

    return {
        "kind": "convert",
        "status": "queued",
        "familyId": request.family_id,
        "requestedByGuardianId": request.guardian_id,
        "targetEnrollmentId": request.enrollment_id,
    }
