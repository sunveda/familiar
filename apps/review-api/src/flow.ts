/**
 * Guardian review stubs: list, preview-ready, approve/reject, revoke/delete.
 * No media bytes. Audit events are intended emit points only (no audit store).
 */

import {
  convertJobMayRun,
  deleteEnrollment,
  revokeEnrollment,
  type AuditEvent,
  type ConsentRecord,
  type Enrollment,
  type FamilyId,
  type GuardianId,
  type IsoTimestamp,
  type Job,
} from '../../../packages/shared/src/index';

import type { ReviewStore } from './store';

export type GuardianJobView = Job & {
  previewReady: boolean;
  media: 'not_served';
};

export type FlowErrorCode =
  | 'not_found'
  | 'illegal_job_status'
  | 'illegal_transition'
  | 'already_deleted'
  | 'wrong_family'
  | 'consent_revoked'
  | 'consent_not_bound'
  | 'missing_enrollment_scopes';

export type FlowResult<T> = { ok: true; value: T } | { ok: false; errorCode: FlowErrorCode };

export function toJobView(job: Job): GuardianJobView {
  return {
    ...job,
    previewReady: job.status === 'needs_review',
    media: 'not_served',
  };
}

export function listFamilyJobs(store: ReviewStore, familyId: FamilyId): GuardianJobView[] {
  return store.listJobs(familyId).map(toJobView);
}

function intendedAudit(
  kind: AuditEvent['kind'],
  jobOrEnrollment: { id: string; familyId: FamilyId },
  actorGuardianId: GuardianId | null,
  at: IsoTimestamp,
  metadata: AuditEvent['metadata'],
): AuditEvent {
  return {
    id: `audit_intended_${kind}_${jobOrEnrollment.id}`,
    familyId: jobOrEnrollment.familyId,
    actorGuardianId,
    kind,
    at,
    subjectRef: jobOrEnrollment.id,
    metadata,
  };
}

function fail(errorCode: FlowErrorCode): FlowResult<never> {
  return { ok: false, errorCode };
}

export function getFamilyJob(
  store: ReviewStore,
  jobId: string,
  familyId?: FamilyId,
): FlowResult<GuardianJobView> {
  const job = store.getJob(jobId);
  if (!job) {
    return fail('not_found');
  }
  if (familyId !== undefined && job.familyId !== familyId) {
    return fail('wrong_family');
  }
  return { ok: true, value: toJobView(job) };
}

export function approveJob(
  store: ReviewStore,
  jobId: string,
  at: IsoTimestamp,
  actorGuardianId: GuardianId | null,
  familyId?: FamilyId,
): FlowResult<{ job: GuardianJobView; intendedAudit: AuditEvent }> {
  const job = store.getJob(jobId);
  if (!job) {
    return fail('not_found');
  }
  if (familyId !== undefined && job.familyId !== familyId) {
    return fail('wrong_family');
  }
  if (job.status !== 'needs_review') {
    return fail('illegal_job_status');
  }

  const next: Job = { ...job, status: 'approved', updatedAt: at };
  store.putJob(next);
  const event = intendedAudit('review_approved', next, actorGuardianId, at, {
    previousStatus: 'needs_review',
    newStatus: 'approved',
  });
  store.recordIntendedAudit(event);
  return { ok: true, value: { job: toJobView(next), intendedAudit: event } };
}

export function rejectJob(
  store: ReviewStore,
  jobId: string,
  at: IsoTimestamp,
  actorGuardianId: GuardianId | null,
  familyId?: FamilyId,
): FlowResult<{ job: GuardianJobView; intendedAudit: AuditEvent }> {
  const job = store.getJob(jobId);
  if (!job) {
    return fail('not_found');
  }
  if (familyId !== undefined && job.familyId !== familyId) {
    return fail('wrong_family');
  }
  if (job.status !== 'needs_review') {
    return fail('illegal_job_status');
  }

  const next: Job = { ...job, status: 'rejected', updatedAt: at };
  store.putJob(next);
  const event = intendedAudit('review_rejected', next, actorGuardianId, at, {
    previousStatus: 'needs_review',
    newStatus: 'rejected',
  });
  store.recordIntendedAudit(event);
  return { ok: true, value: { job: toJobView(next), intendedAudit: event } };
}

function convertProbeJob(enrollment: Enrollment): Job {
  return {
    id: 'convert_probe',
    familyId: enrollment.familyId,
    requestedByGuardianId: enrollment.guardianId,
    kind: 'convert',
    status: 'queued',
    targetEnrollmentId: enrollment.id,
    sourceRef: null,
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.createdAt,
    errorCode: null,
  };
}

/**
 * Reuses canonical `convertJobMayRun`. Missing consent fails closed.
 */
export function convertMayRunAfterEnrollment(
  enrollment: Enrollment,
  consent: ConsentRecord | undefined,
): boolean {
  if (!consent) {
    return false;
  }
  return convertJobMayRun(convertProbeJob(enrollment), enrollment, consent);
}

export function revokeEnrollmentInStore(
  store: ReviewStore,
  enrollmentId: string,
  at: IsoTimestamp,
  actorGuardianId: GuardianId | null,
  familyId?: FamilyId,
): FlowResult<{
  enrollment: Enrollment;
  intendedAudit: AuditEvent;
  convertJobMayRun: boolean;
  convertJobs: 'fail_closed';
}> {
  const current = store.getEnrollment(enrollmentId);
  if (!current) {
    return fail('not_found');
  }

  const result = revokeEnrollment(current, at, familyId !== undefined ? { familyId } : undefined);
  if (!result.ok) {
    return fail(result.errorCode);
  }

  store.putEnrollment(result.enrollment);
  const consent = store.getConsent(result.enrollment.consentRecordId);
  const mayRun = convertMayRunAfterEnrollment(result.enrollment, consent);
  const event = intendedAudit('enrollment_revoked', result.enrollment, actorGuardianId, at, {
    previousStatus: current.status,
    newStatus: result.enrollment.status,
    convertJobMayRun: mayRun,
  });
  store.recordIntendedAudit(event);

  return {
    ok: true,
    value: {
      enrollment: result.enrollment,
      intendedAudit: event,
      convertJobMayRun: mayRun,
      convertJobs: 'fail_closed',
    },
  };
}

export function deleteEnrollmentInStore(
  store: ReviewStore,
  enrollmentId: string,
  at: IsoTimestamp,
  actorGuardianId: GuardianId | null,
  familyId?: FamilyId,
): FlowResult<{
  enrollment: Enrollment;
  intendedAudit: AuditEvent;
  convertJobMayRun: boolean;
  convertJobs: 'fail_closed';
}> {
  const current = store.getEnrollment(enrollmentId);
  if (!current) {
    return fail('not_found');
  }

  const result = deleteEnrollment(current, at, familyId !== undefined ? { familyId } : undefined);
  if (!result.ok) {
    return fail(result.errorCode);
  }

  store.putEnrollment(result.enrollment);
  const consent = store.getConsent(result.enrollment.consentRecordId);
  const mayRun = convertMayRunAfterEnrollment(result.enrollment, consent);
  const event = intendedAudit('enrollment_deleted', result.enrollment, actorGuardianId, at, {
    previousStatus: current.status,
    newStatus: result.enrollment.status,
    artifactRefCleared: result.enrollment.artifactRef === null,
    convertJobMayRun: mayRun,
  });
  store.recordIntendedAudit(event);

  return {
    ok: true,
    value: {
      enrollment: result.enrollment,
      intendedAudit: event,
      convertJobMayRun: mayRun,
      convertJobs: 'fail_closed',
    },
  };
}

export const mediaNotServedBody = {
  error: 'not_implemented',
  detail: 'Preview bytes are not served until auth design. Never stream media from this stub.',
  media: 'not_served',
} as const;
