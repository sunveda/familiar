"""Thin in-memory audit adapter (process lifetime).

Mirrors packages/shared AuditLog: metadata only, reject biometric/secret
keys, isolate list_by_family. Not durable. No media or embeddings.
"""

from __future__ import annotations

from typing import Any

AuditEvent = dict[str, Any]

AUDIT_EVENT_KINDS = frozenset(
    {
        "consent_granted",
        "consent_revoked",
        "enrollment_revoked",
        "enrollment_deleted",
        "convert_refused",
        "convert_queued",
        "review_approved",
        "review_rejected",
    }
)

FORBIDDEN_AUDIT_KEYS = frozenset(
    {
        "embedding",
        "embeddings",
        "sample",
        "samples",
        "samplebytes",
        "audio",
        "audiobytes",
        "wav",
        "face",
        "facebytes",
        "faceimage",
        "image",
        "imagebytes",
        "video",
        "media",
        "mediabytes",
        "privatekey",
        "secret",
        "password",
        "token",
        "apikey",
        "credential",
        "npy",
        "onnx",
        "weights",
        "model",
    }
)


def normalize_audit_key(key: str) -> str:
    return key.lower().replace("_", "").replace("-", "")


def is_forbidden_audit_key(key: str) -> bool:
    return normalize_audit_key(key) in FORBIDDEN_AUDIT_KEYS


def _collect_keys(value: Any, into: list[str]) -> None:
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        into.append(str(key))
        _collect_keys(child, into)


def validate_audit_event(event: AuditEvent) -> dict[str, Any]:
    event_id = event.get("id")
    family_id = event.get("familyId")
    at = event.get("at")
    kind = event.get("kind")
    if not isinstance(event_id, str) or not event_id.strip():
        return {"ok": False, "errorCode": "missing_required_field"}
    if not isinstance(family_id, str) or not family_id.strip():
        return {"ok": False, "errorCode": "missing_required_field"}
    if not isinstance(at, str) or not at.strip():
        return {"ok": False, "errorCode": "missing_required_field"}
    if not isinstance(kind, str) or kind not in AUDIT_EVENT_KINDS:
        return {"ok": False, "errorCode": "invalid_kind"}

    actor = event.get("actorGuardianId")
    if actor is not None and not isinstance(actor, str):
        return {"ok": False, "errorCode": "missing_required_field"}
    subject = event.get("subjectRef")
    if subject is not None and not isinstance(subject, str):
        return {"ok": False, "errorCode": "missing_required_field"}

    metadata = event.get("metadata")
    if not isinstance(metadata, dict):
        return {"ok": False, "errorCode": "missing_required_field"}

    keys = [str(k) for k in event]
    _collect_keys(metadata, keys)
    if any(is_forbidden_audit_key(key) for key in keys):
        return {"ok": False, "errorCode": "forbidden_payload"}

    for value in metadata.values():
        if value is not None and not isinstance(value, (str, int, float, bool)):
            return {"ok": False, "errorCode": "forbidden_payload"}

    return {"ok": True, "event": event}


def _clone(event: AuditEvent) -> AuditEvent:
    copied = dict(event)
    metadata = event.get("metadata")
    copied["metadata"] = dict(metadata) if isinstance(metadata, dict) else {}
    return copied


class AuditLog:
    """Append-only in-memory list. Process lifetime only."""

    def __init__(self) -> None:
        self._events: list[AuditEvent] = []

    def append(self, event: AuditEvent) -> dict[str, Any]:
        checked = validate_audit_event(event)
        if not checked["ok"]:
            return checked
        stored = _clone(checked["event"])
        self._events.append(stored)
        return {"ok": True, "event": _clone(stored)}

    def list_by_family(self, family_id: str) -> list[AuditEvent]:
        return [_clone(event) for event in self._events if event.get("familyId") == family_id]

    def list_by_job(self, job_id: str) -> list[AuditEvent]:
        return [_clone(event) for event in self._events if event.get("subjectRef") == job_id]

    def list_all(self) -> list[AuditEvent]:
        return [_clone(event) for event in self._events]
