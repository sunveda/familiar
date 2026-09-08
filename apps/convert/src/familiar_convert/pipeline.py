"""Placeholder convert gate.

Refuses jobs that lack family-scoped active enrollment and unrevoked consent.
Does not call ML, load weights, or read biometric files.

This is the **runtime mirror** of TypeScript `convertJobMayRun`
(packages/shared). Canonical rule + drift notes: docs/consent-gate.md.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class ConvertRefused(PermissionError):
    """Job cannot run: consent or enrollment check failed."""


@dataclass(frozen=True)
class ConvertRequest:
    family_id: str
    # Requester. Product lock: may differ from the enrollment subject when both
    # are in this family and enrollment_id is an explicit active consented target.
    guardian_id: str
    enrollment_id: str
    enrollment_family_id: str
    enrollment_status: str
    consent_id: str
    consent_family_id: str
    consent_revoked: bool
    consent_scopes: tuple[str, ...]
    enrollment_consent_id: str


class ConvertAbuseHook(Protocol):
    """Thin rate-limit/abuse hook. Real detection is not implemented."""

    def allow_queue(self, request: ConvertRequest) -> bool:
        """Return True to continue after the consent gate has already passed."""


class DisabledConvertAbuseHook:
    """No-op / disabled stub. Must never override a consent refusal."""

    enabled = False

    def allow_queue(self, request: ConvertRequest) -> bool:
        return True


def queue_convert_job(
    request: ConvertRequest,
    *,
    abuse_hook: ConvertAbuseHook | None = None,
) -> dict[str, str]:
    """Return a queued convert descriptor or raise ConvertRefused.

    Consent/enrollment fail-closed runs first. An abuse hook cannot allow a
    job the consent gate refused.
    """
    # Fail-closed consent/enrollment — always before any abuse hook.
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

    hook: ConvertAbuseHook = abuse_hook if abuse_hook is not None else DisabledConvertAbuseHook()
    if not hook.allow_queue(request):
        raise ConvertRefused("abuse hook refused queue")

    return {
        "kind": "convert",
        "status": "queued",
        "familyId": request.family_id,
        "requestedByGuardianId": request.guardian_id,
        "targetEnrollmentId": request.enrollment_id,
    }
