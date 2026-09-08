/**
 * HTTP stubs for guardian review. Never streams preview bytes.
 */

import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';

import type { ConsentRecord, Enrollment, Job } from '../../../packages/shared/src/index';

import { createRouter } from './index';
import { createMemoryStore } from './store';

const at = '2026-01-01T00:00:00.000Z';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    familyId: 'fam_1',
    requestedByGuardianId: 'grd_1',
    kind: 'convert',
    status: 'needs_review',
    targetEnrollmentId: 'enr_1',
    sourceRef: 'library:demo',
    createdAt: at,
    updatedAt: at,
    errorCode: null,
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

describe('review-api HTTP stubs', () => {
  const store = createMemoryStore({
    jobs: [
      job(),
      job({ id: 'job_queued', status: 'queued' }),
      job({ id: 'job_fam2', familyId: 'fam_2' }),
    ],
    enrollments: [enrollment()],
    consents: [consent()],
  });

  let server: Server;
  let base: string;

  before(async () => {
    server = createServer(createRouter(store));
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address() as AddressInfo;
    base = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test('GET /health', async () => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { media: string; ml: boolean };
    assert.equal(body.ml, false);
    assert.equal(body.media, 'not_served');
  });

  test('GET /families/:id/jobs lists family jobs with previewReady', async () => {
    const res = await fetch(`${base}/families/fam_1/jobs`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      jobs: Array<{ id: string; previewReady: boolean; media: string }>;
    };
    const ids = body.jobs.map((item) => item.id).sort();
    assert.deepEqual(ids, ['job_1', 'job_queued']);
    const review = body.jobs.find((item) => item.id === 'job_1');
    const queued = body.jobs.find((item) => item.id === 'job_queued');
    assert.equal(review?.previewReady, true);
    assert.equal(queued?.previewReady, false);
    assert.equal(review?.media, 'not_served');
  });

  test('GET /jobs/:id/preview and /media return 501 without bytes', async () => {
    for (const path of ['/jobs/job_1/preview', '/jobs/job_1/media']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 501);
      assert.equal(res.headers.get('content-type'), 'application/json');
      const body = (await res.json()) as { media: string };
      assert.equal(body.media, 'not_served');
    }
  });

  test('POST /jobs/:id/approve then refuse a second approve', async () => {
    const res = await fetch(`${base}/jobs/job_1/approve`, {
      method: 'POST',
      headers: { 'x-guardian-id': 'grd_1' },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      job: { status: string; previewReady: boolean };
      intendedAudit: { kind: string };
    };
    assert.equal(body.job.status, 'approved');
    assert.equal(body.job.previewReady, false);
    assert.equal(body.intendedAudit.kind, 'review_approved');

    const again = await fetch(`${base}/jobs/job_1/approve`, { method: 'POST' });
    assert.equal(again.status, 409);
  });

  test('POST /jobs/:id/reject on queued job fails closed', async () => {
    const res = await fetch(`${base}/jobs/job_queued/reject`, { method: 'POST' });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'illegal_job_status');
  });

  test('POST /enrollments/:id/revoke fails closed for convert', async () => {
    const res = await fetch(`${base}/enrollments/enr_1/revoke`, {
      method: 'POST',
      headers: { 'x-guardian-id': 'grd_1', 'x-family-id': 'fam_1' },
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      status: string;
      convertJobs: string;
      convertJobMayRun: boolean;
      intendedAudit: { kind: string };
    };
    assert.equal(body.status, 'revoked');
    assert.equal(body.convertJobs, 'fail_closed');
    assert.equal(body.convertJobMayRun, false);
    assert.equal(body.intendedAudit.kind, 'enrollment_revoked');
  });

  test('POST /enrollments/:id/revoke wrong family is refused', async () => {
    const res = await fetch(`${base}/enrollments/enr_1/revoke`, {
      method: 'POST',
      headers: { 'x-family-id': 'fam_other' },
    });
    assert.equal(res.status, 403);
  });

  test('GET job with wrong x-family-id is refused', async () => {
    const res = await fetch(`${base}/jobs/job_fam2`, {
      headers: { 'x-family-id': 'fam_1' },
    });
    assert.equal(res.status, 403);
  });
});
