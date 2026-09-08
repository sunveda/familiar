"""Stub auth / tenancy context. Mirror of packages/shared/src/auth-context.ts.

Not an IdP. Headers prove nothing cryptographically. See docs/auth-tenancy.md.
Keep aligned via packages/shared/fixtures/auth-tenancy-cases.json.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol

AUTH_STUB_MODE = "stub"
STUB_FAMILY_ID_HEADER = "x-family-id"
STUB_GUARDIAN_ID_HEADER = "x-guardian-id"

AuthResolveErrorCode = str


class _HeaderGetter(Protocol):
    def get(self, name: str, default: str | None = None) -> str | None: ...


@dataclass(frozen=True)
class AuthContext:
    guardian_id: str
    family_id: str
    mode: str = AUTH_STUB_MODE

    def as_dict(self) -> dict[str, str]:
        return {
            "guardianId": self.guardian_id,
            "familyId": self.family_id,
            "mode": self.mode,
        }


AuthResult = dict[str, Any]


def _non_empty_id(value: str | None) -> str | None:
    if value is None or not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _first_header_value(raw: object) -> str | None:
    if isinstance(raw, (list, tuple)):
        if not raw:
            return None
        return _non_empty_id(str(raw[0]) if raw[0] is not None else None)
    if raw is None:
        return None
    return _non_empty_id(str(raw))


def read_stub_header(headers: Mapping[str, object] | _HeaderGetter, name: str) -> str | None:
    """Read a stub header. Empty / whitespace-only values are missing."""
    getter = getattr(headers, "get", None)
    if callable(getter):
        raw = getter(name)
        if raw is None and name != name.lower():
            raw = getter(name.lower())
        return _first_header_value(raw)
    if isinstance(headers, Mapping):
        raw = headers.get(name)
        if raw is None:
            raw = headers.get(name.lower())
        return _first_header_value(raw)
    return None


def resolve_auth_context(
    *,
    guardian_id: str | None,
    family_id: str | None,
) -> AuthResult:
    """In-process resolver. Requires non-empty guardian and family ids."""
    guardian = _non_empty_id(guardian_id)
    if not guardian:
        return {"ok": False, "errorCode": "missing_guardian"}
    family = _non_empty_id(family_id)
    if not family:
        return {"ok": False, "errorCode": "missing_family"}
    return {
        "ok": True,
        "context": AuthContext(guardian_id=guardian, family_id=family, mode=AUTH_STUB_MODE),
    }


def resolve_auth_context_from_headers(headers: Mapping[str, object] | _HeaderGetter) -> AuthResult:
    """HTTP stub: parse x-guardian-id + x-family-id, then resolve_auth_context."""
    return resolve_auth_context(
        guardian_id=read_stub_header(headers, STUB_GUARDIAN_ID_HEADER),
        family_id=read_stub_header(headers, STUB_FAMILY_ID_HEADER),
    )


def assert_same_family(ctx: AuthContext, resource_family_id: str | None) -> AuthResult:
    """Fail closed: resource family must be non-empty and equal to ctx.family_id."""
    resource = _non_empty_id(resource_family_id)
    if not resource or resource != ctx.family_id:
        return {"ok": False, "errorCode": "wrong_family"}
    return {"ok": True}


def http_status_for_auth_error(code: str) -> int:
    if code == "wrong_family":
        return 403
    return 401
