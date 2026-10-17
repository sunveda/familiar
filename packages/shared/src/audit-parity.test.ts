/**
 * TS side of audit kind parity. Python mirrors read the same fixture
 * (apps/convert/tests/test_audit_parity.py, apps/ingest/tests/test_audit_parity.py).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { AUDIT_EVENT_KINDS, FORBIDDEN_AUDIT_KEYS } from './audit';

const fixturePath = join(__dirname, '..', 'fixtures', 'audit-kinds.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  kinds: string[];
  forbiddenKeys: string[];
};

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

describe('audit kind parity fixture', () => {
  test('AUDIT_EVENT_KINDS equals the fixture', () => {
    assert.deepEqual(sorted(AUDIT_EVENT_KINDS), sorted(fixture.kinds));
  });

  test('FORBIDDEN_AUDIT_KEYS equals the fixture', () => {
    assert.deepEqual(sorted(FORBIDDEN_AUDIT_KEYS), sorted(fixture.forbiddenKeys));
  });

  test('AuditEventKind union in types.ts equals AUDIT_EVENT_KINDS', () => {
    // Tests run from packages/shared/dist-test; the source lives in ../src.
    const typesPath = join(__dirname, '..', 'src', 'types.ts');
    const text = readFileSync(typesPath, 'utf8');
    const start = text.indexOf('export type AuditEventKind');
    const end = text.indexOf(';', start);
    const union = [...text.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1] ?? '');
    assert.deepEqual(sorted(union), sorted(AUDIT_EVENT_KINDS));
  });

  test('fixture has no duplicates', () => {
    assert.equal(new Set(fixture.kinds).size, fixture.kinds.length);
    assert.equal(new Set(fixture.forbiddenKeys).size, fixture.forbiddenKeys.length);
  });
});
