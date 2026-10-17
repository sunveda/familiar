/**
 * Consent revoke cascades to bound enrollments (fail closed, family-scoped).
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  convertJobMayRun,
  type ConsentRecord,
  type Enrollment,
  type Job,
} from '../../../packages/shared/src/index';

import { revokeConsentInStore } from './flow';
import { createMemoryStore } from './store';

const at = '2026-01-01T00:00:00.000Z';
const later = '2026-02-01T00:00:00.000Z';
const latest = '2026-03-01T00:00:00.000Z';

function consent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    id: 'cns_1',
    familyId: 'fam_1',
    guardianId: 'grd_1',
    policyVersion: 'stub-0',
    grantedAt: at,
    revokedAt: null,
    affirmationMethod: 'explicit_ui',
    scopes: ['voice_enrollment', 'face_enrollment', 'inference_on_family_content'],
    ...overrides,
  };
}

function enrollment(overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'enr_1',
    familyId: 'fam_1',
    guardianId: 'grd_1',
    consentRecordId: 'cns_1',
    modality: 'voice_and_face',
    status: 'active',
    artifactRef: {
      storageKey: 'opaque:enr_1',
      contentType: 'application/octet-stream',
      createdAt: at,
    },
    createdAt: at,
    revokedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function convertJob(enrollmentId: string, familyId = 'fam_1'): Job {
  return {
    id: 'job_1',
    familyId,
    requestedByGuardianId: 'grd_1',
    kind: 'convert',
    status: 'queued',
    targetEnrollmentId: enrollmentId,
    sourceRef: 'library:demo',
    createdAt: at,
    updatedAt: at,
    errorCode: null,
  };
}

describe('revokeConsentInStore cascade', () => {
  test('revokes every non-terminal enrollment bound to the consent and audits each', () => {
    const store = createMemoryStore({
      consents: [consent()],
      enrollments: [
        enrollment(),
        enrollment({ id: 'enr_pending', status: 'pending' }),
        enrollment({ id: 'enr_deleted', status: 'deleted', artifactRef: null, deletedAt: at }),
      ],
    });
    const result = revokeConsentInStore(store, 'cns_1', later, 'grd_1', 'fam_1');
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.deepEqual(result.value.revokedEnrollments.map((e) => e.id).sort(), [
      'enr_1',
      'enr_pending',
    ]);
    for (const id of ['enr_1', 'enr_pending']) {
      const e = store.getEnrollment(id);
      assert.equal(e?.status, 'revoked');
      assert.equal(e?.revokedAt, later);
      // Existing revoke semantics: opaque ref kept until guardian delete.
      assert.notEqual(e?.artifactRef, null);
    }
    const deleted = store.getEnrollment('enr_deleted');
    assert.equal(deleted?.status, 'deleted');
    assert.equal(deleted?.artifactRef, null);

    const audits = store.listAuditsByFamily('fam_1');
    assert.deepEqual(audits.map((a) => a.kind).sort(), [
      'consent_revoked',
      'enrollment_revoked',
      'enrollment_revoked',
    ]);
    const consentAudit = audits.find((a) => a.kind === 'consent_revoked');
    assert.equal(consentAudit?.metadata.enrollmentsRevoked, 2);
    // Metadata only: no artifact keys leak into audit events.
    assert.equal(JSON.stringify(audits).includes('opaque:'), false);
  });

  test('convert gate refuses afterwards', () => {
    const store = createMemoryStore({ consents: [consent()], enrollments: [enrollment()] });
    const before = convertJobMayRun(convertJob('enr_1'), enrollment(), consent());
    assert.equal(before, true);
    const result = revokeConsentInStore(store, 'cns_1', later, 'grd_1', 'fam_1');
    assert.equal(result.ok, true);
    const e = store.getEnrollment('enr_1');
    const c = store.getConsent('cns_1');
    assert.ok(e && c);
    assert.equal(convertJobMayRun(convertJob('enr_1'), e, c), false);
    // Even with the stale (pre-revoke) consent, the revoked enrollment refuses.
    assert.equal(convertJobMayRun(convertJob('enr_1'), e, consent()), false);
  });

  test('leaves enrollments bound to other consents untouched', () => {
    const store = createMemoryStore({
      consents: [consent(), consent({ id: 'cns_2', guardianId: 'grd_2' })],
      enrollments: [
        enrollment(),
        enrollment({ id: 'enr_2', guardianId: 'grd_2', consentRecordId: 'cns_2' }),
      ],
    });
    revokeConsentInStore(store, 'cns_1', later, 'grd_1', 'fam_1');
    assert.equal(store.getEnrollment('enr_1')?.status, 'revoked');
    assert.equal(store.getEnrollment('enr_2')?.status, 'active');
    assert.equal(store.getConsent('cns_2')?.revokedAt, null);
  });

  test('cross-family request is denied and mutates nothing', () => {
    const store = createMemoryStore({ consents: [consent()], enrollments: [enrollment()] });
    const result = revokeConsentInStore(store, 'cns_1', later, 'grd_x', 'fam_other');
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
    assert.equal(store.getConsent('cns_1')?.revokedAt, null);
    assert.equal(store.getEnrollment('enr_1')?.status, 'active');
    assert.equal(store.listAuditsByFamily('fam_1').length, 0);
  });

  test('unknown consent is not_found and mutates nothing', () => {
    const store = createMemoryStore({ enrollments: [enrollment()] });
    assert.deepEqual(revokeConsentInStore(store, 'nope', later, 'grd_1', 'fam_1'), {
      ok: false,
      errorCode: 'not_found',
    });
    assert.equal(store.getEnrollment('enr_1')?.status, 'active');
  });

  test('does not touch a cross-family enrollment that points at this consent id', () => {
    const store = createMemoryStore({
      consents: [consent()],
      enrollments: [enrollment({ id: 'enr_foreign', familyId: 'fam_2' })],
    });
    revokeConsentInStore(store, 'cns_1', later, 'grd_1', 'fam_1');
    assert.equal(store.getEnrollment('enr_foreign')?.status, 'active');
    assert.equal(store.listAuditsByFamily('fam_2').length, 0);
    // Gate still refuses it (family mismatch + revoked consent).
    const c = store.getConsent('cns_1');
    const e = store.getEnrollment('enr_foreign');
    assert.ok(c && e);
    assert.equal(convertJobMayRun(convertJob('enr_foreign', 'fam_2'), e, c), false);
  });

  test('idempotent: second revoke keeps timestamps and emits no new enrollment audits', () => {
    const store = createMemoryStore({ consents: [consent()], enrollments: [enrollment()] });
    const first = revokeConsentInStore(store, 'cns_1', later, 'grd_1', 'fam_1');
    assert.equal(first.ok, true);
    const second = revokeConsentInStore(store, 'cns_1', latest, 'grd_1', 'fam_1');
    assert.equal(second.ok, true);
    if (!second.ok) {
      return;
    }
    assert.equal(second.value.revokedEnrollments.length, 0);
    assert.equal(second.value.consent.revokedAt, later);
    assert.equal(store.getEnrollment('enr_1')?.revokedAt, later);
    const kinds = store.listAuditsByFamily('fam_1').map((a) => a.kind);
    assert.equal(kinds.filter((k) => k === 'enrollment_revoked').length, 1);
    assert.equal(second.value.intendedAudit.metadata.alreadyRevoked, true);
  });

  test('repairs an unrevoked enrollment bound to an already-revoked consent', () => {
    const store = createMemoryStore({
      consents: [consent({ revokedAt: later })],
      enrollments: [enrollment()],
    });
    const result = revokeConsentInStore(store, 'cns_1', latest, 'grd_1', 'fam_1');
    assert.equal(result.ok, true);
    assert.equal(store.getEnrollment('enr_1')?.status, 'revoked');
    assert.equal(store.getConsent('cns_1')?.revokedAt, later);
  });
});
