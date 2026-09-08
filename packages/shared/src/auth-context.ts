/**
 * Stub auth / tenancy context.
 *
 * Production auth is blocked / not ready. This is a shared tenancy stub, not an
 * IdP, OIDC provider, or JWT verifier. Do not add fake JWT/JWKS/OIDC
 * verification theater. No secrets belong in this module or in git.
 * Family isolation: `assertSameFamily` (fail closed). See docs/auth-tenancy.md.
 */

import type { FamilyId, GuardianId } from './types';

/** Only value in this slice. Not `'idp'` — production auth is not ready. */
export const AUTH_STUB_MODE = 'stub' as const;

export type AuthMode = typeof AUTH_STUB_MODE;

/**
 * Bound guardian + family for a request. `mode: 'stub'` means claimed ids only —
 * not a verified principal. Production auth is blocked.
 */
export interface AuthContext {
  guardianId: GuardianId;
  familyId: FamilyId;
  mode: AuthMode;
}

/** Alias — tenancy is family-scoped; the stub context is the tenancy context. */
export type TenancyContext = AuthContext;

export const STUB_FAMILY_ID_HEADER = 'x-family-id';
export const STUB_GUARDIAN_ID_HEADER = 'x-guardian-id';

export type AuthResolveErrorCode = 'missing_guardian' | 'missing_family' | 'wrong_family';

export type AuthResolveResult =
  { ok: true; context: AuthContext } | { ok: false; errorCode: AuthResolveErrorCode };

export interface ResolveAuthInput {
  guardianId?: string | null;
  familyId?: string | null;
}

export type StubHeaderValue = string | string[] | undefined | null;

export type StubHeaderMap = Record<string, StubHeaderValue>;

export interface StubHeaderGetter {
  get(name: string): string | null | undefined;
}

export type StubHeaders = StubHeaderMap | StubHeaderGetter | NodeLikeHeaders;

/** Node `IncomingHttpHeaders` and similar maps. */
export interface NodeLikeHeaders {
  readonly [name: string]: string | string[] | undefined;
}

function nonEmptyId(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstHeaderValue(raw: StubHeaderValue): string | undefined {
  if (Array.isArray(raw)) {
    const first = raw[0];
    return nonEmptyId(first);
  }
  return nonEmptyId(raw);
}

function isHeaderGetter(headers: StubHeaders): headers is StubHeaderGetter {
  return typeof (headers as StubHeaderGetter).get === 'function';
}

/**
 * Read a stub header. Node lowercases names; Python's header map is
 * case-insensitive. Empty / whitespace-only values are treated as missing.
 */
export function readStubHeader(headers: StubHeaders, name: string): string | undefined {
  const lower = name.toLowerCase();
  if (isHeaderGetter(headers)) {
    return firstHeaderValue(headers.get(lower) ?? headers.get(name));
  }
  return firstHeaderValue(headers[lower] ?? headers[name]);
}

/**
 * In-process resolver. Requires non-empty guardianId and familyId.
 * Does not look up membership, verify JWT/OIDC, or read secrets — there is no
 * directory and production auth is blocked.
 *
 * Principal is required first: missing guardian is reported even if family is
 * also missing, so a family id is never accepted without a principal.
 */
export function resolveAuthContext(input: ResolveAuthInput): AuthResolveResult {
  const guardianId = nonEmptyId(input.guardianId);
  if (!guardianId) {
    return { ok: false, errorCode: 'missing_guardian' };
  }
  const familyId = nonEmptyId(input.familyId);
  if (!familyId) {
    return { ok: false, errorCode: 'missing_family' };
  }
  return {
    ok: true,
    context: { guardianId, familyId, mode: AUTH_STUB_MODE },
  };
}

/**
 * HTTP stub: parse `x-guardian-id` + `x-family-id`, then `resolveAuthContext`.
 * Not bearer/JWT/OIDC. Anyone who can set headers can claim any pair.
 */
export function resolveAuthContextFromHeaders(headers: StubHeaders): AuthResolveResult {
  return resolveAuthContext({
    guardianId: readStubHeader(headers, STUB_GUARDIAN_ID_HEADER),
    familyId: readStubHeader(headers, STUB_FAMILY_ID_HEADER),
  });
}

/**
 * Family isolation lock (fail closed): resource family must be non-empty and
 * equal to `ctx.familyId`. Do not skip, default, or treat mismatch as a warning.
 * Callers must already have a bound context (principal + family).
 */
export function assertSameFamily(
  ctx: AuthContext,
  resourceFamilyId: string | null | undefined,
): { ok: true } | { ok: false; errorCode: 'wrong_family' } {
  const resource = nonEmptyId(resourceFamilyId);
  if (!resource || resource !== ctx.familyId) {
    return { ok: false, errorCode: 'wrong_family' };
  }
  return { ok: true };
}

export function httpStatusForAuthError(code: AuthResolveErrorCode): number {
  if (code === 'wrong_family') {
    return 403;
  }
  return 401;
}
