/**
 * Guardian review stubs: list, preview-ready, approve/reject, revoke/delete,
 * consent grant/revoke. No media bytes. Audit events append to the shared
 * in-memory AuditLog (process lifetime; not durable).
 */

import {
  convertJobMayRun,
  createAuditEvent,
  deleteEnrollment,
  grantConsent,
  revokeConsent,
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
  | 'missing_enrollment_scopes'
  | 'missing_required_field';

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
  return createAuditEvent({
    kind,
    familyId: jobOrEnrollment.familyId,
    actorGuardianId,
    at,
    subjectRef: jobOrEnrollment.id,
    metadata,
  });
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

export function grantConsentInStore(
  store: ReviewStore,
  input: {
    id: string;
    familyId: FamilyId;
    guardianId: GuardianId;
    policyVersion: string;
    scopes: ConsentRecord['scopes'];
    at: IsoTimestamp;
  },
  expectedFamilyId?: FamilyId,
): FlowResult<{ consent: ConsentRecord; intendedAudit: AuditEvent }> {
  if (expectedFamilyId !== undefined && input.familyId !== expectedFamilyId) {
    return fail('wrong_family');
  }
  const result = grantConsent(input);
  if (!result.ok) {
    return fail(result.errorCode);
  }
  store.putConsent(result.consent);
  store.recordIntendedAudit(result.intendedAudit);
  return { ok: true, value: { consent: result.consent, intendedAudit: result.intendedAudit } };
}

/**
 * Withdraw consent and cascade to every enrollment bound to it (fail closed).
 *
 * - Family-scoped: only enrollments in the consent's family are touched; an
 *   enrollment in another family that points at this consent id is left alone
 *   (it already fails `convertJobMayRun` on `familyId` mismatch).
 * - Uses the existing `revokeEnrollment` semantics: status `revoked`,
 *   `revokedAt` set, `artifactRef` retained as an opaque pointer so the
 *   guardian-driven delete can still purge bytes. `deleted` is terminal and
 *   skipped. Revoked enrollments never pass the convert gate.
 * - Idempotent: repeating the call changes nothing further, but still repairs
 *   any enrollment bound to the consent that is somehow not yet revoked.
 * - All transitions are computed before any write; a failure writes nothing.
 * - Audit events are metadata only (no artifact keys).
 */
export function revokeConsentInStore(
  store: ReviewStore,
  consentId: string,
  at: IsoTimestamp,
  actorGuardianId: GuardianId | null,
  familyId?: FamilyId,
): FlowResult<{
  consent: ConsentRecord;
  intendedAudit: AuditEvent;
  revokedEnrollments: Enrollment[];
  enrollmentAudits: AuditEvent[];
  convertJobMayRun: boolean;
}> {
  const current = store.getConsent(consentId);
  if (!current) {
    return fail('not_found');
  }
  const result = revokeConsent(current, at, familyId !== undefined ? { familyId } : undefined);
  if (!result.ok) {
    return fail(result.errorCode);
  }

  const planned: { before: Enrollment; after: Enrollment }[] = [];
  for (const enrollment of store.listEnrollmentsByConsent(consentId)) {
    if (enrollment.familyId !== result.consent.familyId) {
      continue;
    }
    if (enrollment.status === 'revoked' || enrollment.status === 'deleted') {
      continue;
    }
    const revoked = revokeEnrollment(enrollment, at, { familyId: result.consent.familyId });
    if (!revoked.ok) {
      return fail(revoked.errorCode);
    }
    planned.push({ before: enrollment, after: revoked.enrollment });
  }

  store.putConsent(result.consent);
  const revokedEnrollments: Enrollment[] = [];
  const enrollmentAudits: AuditEvent[] = [];
  for (const { before, after } of planned) {
    store.putEnrollment(after);
    revokedEnrollments.push(after);
    const audit = intendedAudit('enrollment_revoked', after, actorGuardianId, at, {
      previousStatus: before.status,
      newStatus: after.status,
      cause: 'consent_revoked',
      consentRecordId: result.consent.id,
      convertJobMayRun: false,
    });
    store.recordIntendedAudit(audit);
    enrollmentAudits.push(audit);
  }

  const event = createAuditEvent({
    kind: 'consent_revoked',
    familyId: result.consent.familyId,
    actorGuardianId,
    at,
    subjectRef: result.consent.id,
    metadata: {
      alreadyRevoked: current.revokedAt !== null,
      enrollmentsRevoked: revokedEnrollments.length,
    },
  });
  store.recordIntendedAudit(event);
  return {
    ok: true,
    value: {
      consent: result.consent,
      intendedAudit: event,
      revokedEnrollments,
      enrollmentAudits,
      // Revoked consent cannot pass convertJobMayRun (fail closed).
      convertJobMayRun: false,
    },
  };
}

export const mediaNotServedBody = {
  error: 'not_implemented',
  detail:
    'Preview bytes are not served. Auth is stub-only (see docs/auth-tenancy.md). Never stream media from this stub.',
  media: 'not_served',
} as const;
