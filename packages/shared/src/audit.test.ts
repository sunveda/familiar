/**
 * In-memory AuditLog: required fields, forbidden biometric/secret keys,
 * family isolation. Process lifetime only — no durable store.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createAuditEvent, createAuditLog, isForbiddenAuditKey, validateAuditEvent } from './audit';
import type { AuditEvent } from './types';

const at = '2026-01-01T00:00:00.000Z';

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 'audit_1',
    familyId: 'fam_1',
    actorGuardianId: 'grd_1',
    kind: 'review_approved',
    at,
    subjectRef: 'job_1',
    metadata: { previousStatus: 'needs_review', newStatus: 'approved' },
    ...overrides,
  };
}

describe('createAuditEvent / validateAuditEvent', () => {
  test('builds a metadata-only event with a stable intended id', () => {
    const built = createAuditEvent({
      kind: 'convert_queued',
      familyId: 'fam_1',
      actorGuardianId: 'grd_a',
      at,
      subjectRef: 'cvt_1',
      metadata: { targetEnrollmentId: 'enr_1' },
    });
    assert.equal(built.id, 'audit_intended_convert_queued_cvt_1');
    assert.equal(built.kind, 'convert_queued');
    assert.equal(validateAuditEvent(built).ok, true);
  });

  test('rejects missing required fields', () => {
    assert.equal(validateAuditEvent(event({ id: '' })).ok, false);
    assert.equal(validateAuditEvent(event({ familyId: '   ' })).ok, false);
    assert.equal(validateAuditEvent(event({ at: '' })).ok, false);
  });

  test('rejects unknown kind', () => {
    const result = validateAuditEvent(event({ kind: 'not_a_kind' as AuditEvent['kind'] }));
    assert.deepEqual(result, { ok: false, errorCode: 'invalid_kind' });
  });

  test('rejects biometric / secret metadata keys', () => {
    for (const key of ['embedding', 'sample', 'audio', 'faceBytes', 'privateKey', 'secret']) {
      const result = validateAuditEvent(event({ metadata: { [key]: 'nope' } }));
      assert.equal(result.ok, false, key);
      if (!result.ok) {
        assert.equal(result.errorCode, 'forbidden_payload');
      }
    }
  });

  test('isForbiddenAuditKey is case- and punctuation-insensitive', () => {
    assert.equal(isForbiddenAuditKey('face_bytes'), true);
    assert.equal(isForbiddenAuditKey('Embedding'), true);
    assert.equal(isForbiddenAuditKey('targetEnrollmentId'), false);
    assert.equal(isForbiddenAuditKey('previousStatus'), false);
  });

  test('rejects nested objects in metadata (could hide embeddings)', () => {
    const result = validateAuditEvent(
      event({
        metadata: { nested: { embedding: [1, 2, 3] } } as unknown as AuditEvent['metadata'],
      }),
    );
    assert.deepEqual(result, { ok: false, errorCode: 'forbidden_payload' });
  });
});

describe('AuditLog family isolation', () => {
  test('append then listByFamily never returns another family', () => {
    const log = createAuditLog();
    assert.equal(log.append(event()).ok, true);
    assert.equal(
      log.append(event({ id: 'audit_2', familyId: 'fam_2', subjectRef: 'job_2' })).ok,
      true,
    );

    const fam1 = log.listByFamily('fam_1');
    const fam2 = log.listByFamily('fam_2');
    const missing = log.listByFamily('fam_other');

    assert.equal(fam1.length, 1);
    assert.equal(fam1[0]?.familyId, 'fam_1');
    assert.equal(fam1[0]?.subjectRef, 'job_1');
    assert.equal(fam2.length, 1);
    assert.equal(fam2[0]?.familyId, 'fam_2');
    assert.equal(missing.length, 0);
    assert.equal(
      fam1.some((item) => item.familyId === 'fam_2'),
      false,
    );
  });

  test('listByJob returns only that subject and does not leak other jobs', () => {
    const log = createAuditLog();
    log.append(event());
    log.append(event({ id: 'audit_2', subjectRef: 'job_2', kind: 'review_rejected' }));
    log.append(
      event({ id: 'audit_3', familyId: 'fam_2', subjectRef: 'job_1', kind: 'convert_queued' }),
    );

    const forJob = log.listByJob('job_1');
    assert.equal(forJob.length, 2);
    assert.equal(
      forJob.every((item) => item.subjectRef === 'job_1'),
      true,
    );
    assert.equal(log.listByJob('job_missing').length, 0);
  });

  test('append refuses forbidden payload and does not store it', () => {
    const log = createAuditLog();
    const result = log.append(event({ metadata: { embedding: 'vector' } }));
    assert.equal(result.ok, false);
    assert.equal(log.listByFamily('fam_1').length, 0);
  });

  test('stored events are copies (mutating the append input cannot rewrite the log)', () => {
    const log = createAuditLog();
    const input = event();
    log.append(input);
    input.familyId = 'fam_hijack';
    input.metadata.newStatus = 'tampered';
    const listed = log.listByFamily('fam_1');
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.familyId, 'fam_1');
    assert.equal(listed[0]?.metadata.newStatus, 'approved');
    assert.equal(log.listByFamily('fam_hijack').length, 0);
  });
});
