"""Opaque external sourceRef validation.

Ingest registers URL/path placeholders only. This git tree is never a media
store. Mirror of packages/shared/src/source-ref.ts — keep aligned via
packages/shared/fixtures/source-ref-cases.json.
"""

from __future__ import annotations

ALLOWED_SOURCE_REF_SCHEMES = frozenset({"http", "https", "s3", "gs", "library", "external"})


def is_external_source_ref(source_ref: str) -> bool:
    """Return True when source_ref is a non-empty opaque external pointer."""
    trimmed = source_ref.strip()
    if not trimmed:
        return False
    if ".." in trimmed or "\\" in trimmed:
        return False
    if trimmed.startswith("/") or trimmed.startswith("./"):
        return False
    colon = trimmed.find(":")
    if colon <= 0:
        return False
    scheme = trimmed[:colon].lower()
    if scheme not in ALLOWED_SOURCE_REF_SCHEMES:
        return False
    rest = trimmed[colon + 1 :]
    return len(rest) > 0
