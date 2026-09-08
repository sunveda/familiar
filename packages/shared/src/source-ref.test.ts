/**
 * Unit tests for opaque external sourceRef validation.
 *
 * Shared cases: ../fixtures/source-ref-cases.json (mirrored in Python ingest).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { isExternalSourceRef } from './source-ref';

interface SourceRefCase {
  id: string;
  sourceRef: string;
  expectOk: boolean;
  notes: string;
}

interface SourceRefFixture {
  cases: SourceRefCase[];
}

const fixturePath = join(__dirname, '..', 'fixtures', 'source-ref-cases.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as SourceRefFixture;

describe('isExternalSourceRef (shared fixture)', () => {
  for (const refCase of fixture.cases) {
    test(`${refCase.id}: ${refCase.notes}`, () => {
      assert.equal(isExternalSourceRef(refCase.sourceRef), refCase.expectOk);
    });
  }
});

describe('isExternalSourceRef (explicit)', () => {
  test('accepts library and https placeholders', () => {
    assert.equal(isExternalSourceRef('library:demo'), true);
    assert.equal(isExternalSourceRef('https://cdn.example.invalid/v'), true);
  });

  test('refuses repo and local paths as media stores', () => {
    assert.equal(isExternalSourceRef('apps/ingest/clip.mp4'), false);
    assert.equal(isExternalSourceRef('./media/foo.mp4'), false);
    assert.equal(isExternalSourceRef('file:///workspace/media/x.mp4'), false);
  });
});
