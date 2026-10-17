"""Minimal stdlib HTTP entry point for the ingest stub service.

Run:  python -m familiar_ingest.server   (from apps/ingest/src, or with PYTHONPATH set)

Wraps the existing stub handler in `familiar_ingest.http` only: health, stub-auth
tenancy (x-family-id / x-guardian-id), in-memory store. No ML, no media, no
network fetches, no files, no secrets. Production auth is blocked — the stub
headers are claimed ids, not proof — so this server binds to loopback only
unless FAMILIAR_ALLOW_NON_LOOPBACK=1 is set explicitly. Standard library
only: no third-party dependency was added.

Environment:
  FAMILIAR_INGEST_HOST  default 127.0.0.1
  FAMILIAR_INGEST_PORT  default 8002
"""

from __future__ import annotations

import ipaddress
import os
import sys
from http.server import ThreadingHTTPServer

from familiar_ingest.http import create_handler
from familiar_ingest.store import create_memory_store

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8002
ALLOW_NON_LOOPBACK_ENV = "FAMILIAR_ALLOW_NON_LOOPBACK"


class UnsafeBindError(ValueError):
    """Raised when the bind address is not loopback and not explicitly allowed."""


def _is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def resolve_bind(env: dict[str, str] | None = None) -> tuple[str, int]:
    """Return (host, port) from env. Fails closed on non-loopback or bad port."""
    source = os.environ if env is None else env
    host = source.get("FAMILIAR_INGEST_HOST", DEFAULT_HOST).strip() or DEFAULT_HOST
    raw_port = source.get("FAMILIAR_INGEST_PORT", str(DEFAULT_PORT)).strip()
    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError(f"invalid port: {raw_port!r}") from exc
    if not 0 <= port <= 65535:
        raise ValueError(f"invalid port: {port}")
    if not _is_loopback(host) and source.get(ALLOW_NON_LOOPBACK_ENV) != "1":
        raise UnsafeBindError(
            f"refusing to bind stub-auth service to non-loopback host {host!r}; "
            f"set {ALLOW_NON_LOOPBACK_ENV}=1 only for isolated development"
        )
    return host, port


def create_server(host: str, port: int, store: IngestStore | None = None) -> ThreadingHTTPServer:
    """Build (not start) the server with a fresh in-memory store by default."""
    handler = create_handler(store if store is not None else create_memory_store())
    return ThreadingHTTPServer((host, port), handler)


def main() -> int:
    try:
        host, port = resolve_bind()
    except ValueError as exc:
        print(f"ingest: {exc}", file=sys.stderr)
        return 2
    server = create_server(host, port)
    bound_host, bound_port = server.server_address[:2]
    print(f"ingest stub listening on http://{bound_host}:{bound_port} (stub auth, no ML)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
