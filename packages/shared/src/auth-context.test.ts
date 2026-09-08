/**
 * Unit tests for stub AuthContext / tenancy resolver.
 *
 * Shared cases: ../fixtures/auth-tenancy-cases.json (mirrored in Python ingest).
 * These tests cover claimed-header parsing and fail-closed family isolation.
 * They are not JWT/OIDC tests — production auth is blocked.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import {
  AUTH_STUB_MODE,
  STUB_FAMILY_ID_HEADER,
  STUB_GUARDIAN_ID_HEADER,
  assertSameFamily,
  httpStatusForAuthError,
  resolveAuthContext,
  resolveAuthContextFromHeaders,
  type AuthResolveErrorCode,
} from './auth-context';

interface AuthTenancyCase {
  id: string;
  guardianId: string | null;
  familyId: string | null;
  resourceFamilyId: string;
  expectOk: boolean;
  expectError: AuthResolveErrorCode | null;
  notes: string;
}

interface AuthTenancyFixture {
  cases: AuthTenancyCase[];
}

const fixturePath = join(__dirname, '..', 'fixtures', 'auth-tenancy-cases.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as AuthTenancyFixture;

function runCase(authCase: AuthTenancyCase): { ok: boolean; errorCode?: AuthResolveErrorCode } {
  const resolved = resolveAuthContext({
    guardianId: authCase.guardianId,
    familyId: authCase.familyId,
  });
  if (!resolved.ok) {
    return { ok: false, errorCode: resolved.errorCode };
  }
  const same = assertSameFamily(resolved.context, authCase.resourceFamilyId);
  if (!same.ok) {
    return { ok: false, errorCode: same.errorCode };
  }
  return { ok: true };
}

describe('auth-tenancy (shared fixture)', () => {
  for (const authCase of fixture.cases) {
    test(`${authCase.id}: ${authCase.notes}`, () => {
      const result = runCase(authCase);
      assert.equal(result.ok, authCase.expectOk, authCase.id);
      if (authCase.expectOk) {
        assert.equal(result.errorCode, undefined);
      } else {
        assert.equal(result.errorCode, authCase.expectError);
      }
    });
  }
});

describe('resolveAuthContext / headers', () => {
  test('happy path binds guardian, family, and stub mode', () => {
    const resolved = resolveAuthContext({ guardianId: 'grd_1', familyId: 'fam_1' });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.deepEqual(resolved.context, {
        guardianId: 'grd_1',
        familyId: 'fam_1',
        mode: AUTH_STUB_MODE,
      });
    }
  });

  test('missing headers fail closed', () => {
    const resolved = resolveAuthContextFromHeaders({});
    assert.deepEqual(resolved, { ok: false, errorCode: 'missing_guardian' });
  });

  test('header map happy path', () => {
    const resolved = resolveAuthContextFromHeaders({
      [STUB_FAMILY_ID_HEADER]: 'fam_1',
      [STUB_GUARDIAN_ID_HEADER]: 'grd_1',
    });
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.context.familyId, 'fam_1');
      assert.equal(resolved.context.guardianId, 'grd_1');
      assert.equal(resolved.context.mode, 'stub');
    }
  });

  test('getter-style headers (Python Message-like)', () => {
    const headers = {
      get(name: string): string | undefined {
        if (name === STUB_GUARDIAN_ID_HEADER) {
          return 'grd_9';
        }
        if (name === STUB_FAMILY_ID_HEADER) {
          return 'fam_9';
        }
        return undefined;
      },
    };
    const resolved = resolveAuthContextFromHeaders(headers);
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.context.guardianId, 'grd_9');
      assert.equal(resolved.context.familyId, 'fam_9');
    }
  });

  test('assertSameFamily refuses mismatch and empty resource', () => {
    const resolved = resolveAuthContext({ guardianId: 'grd_1', familyId: 'fam_1' });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) {
      return;
    }
    assert.deepEqual(assertSameFamily(resolved.context, 'fam_other'), {
      ok: false,
      errorCode: 'wrong_family',
    });
    assert.deepEqual(assertSameFamily(resolved.context, 'fam_1'), { ok: true });
  });

  test('http status mapping is 401 missing / 403 mismatch', () => {
    assert.equal(httpStatusForAuthError('missing_guardian'), 401);
    assert.equal(httpStatusForAuthError('missing_family'), 401);
    assert.equal(httpStatusForAuthError('wrong_family'), 403);
  });
});
