/**
 * Convert job queue stubs (no ML).
 *
 * Queue requires explicit `targetEnrollmentId` and canonical `convertJobMayRun`.
 * Status stubs: queued → running → needs_review | failed | cancelled.
 * Success lands in `needs_review` for guardian review-api. KidProfile is never
 * a convert target. No inference, media, or embeddings.
 */

import { convertJobMayRun } from './types';
import type {
  AuditEvent,
  ConsentRecord,
  Enrollment,
  FamilyId,
  GuardianId,
  IsoTimestamp,
  Job,
  KidProfile,
} from './types';

export type ConvertQueueErrorCode =
  | 'not_found'
  | 'wrong_family'
  | 'illegal_job_status'
  | 'missing_target_enrollment'
  | 'convert_refused'
  | 'kid_profile_not_target';

export type ConvertQueueResult =
  | {
      ok: true;
      job: Job;
      intendedAudit: AuditEvent;
    }
  | { ok: false; errorCode: ConvertQueueErrorCode; intendedAudit?: AuditEvent };

export type ConvertTransitionResult =
  { ok: true; job: Job } | { ok: false; errorCode: ConvertQueueErrorCode };

export interface ConvertQueueInput {
  familyId: FamilyId;
  requestedByGuardianId: GuardianId;
  /** Required. Convert is not inferred from family membership. */
  targetEnrollmentId: string | null | undefined;
  enrollment: Enrollment | undefined;
  consent: ConsentRecord | undefined;
  /** If this id matches a KidProfile, refuse — kids are not convert targets. */
  kidProfile: KidProfile | undefined;
  sourceRef?: string | null;
  at: IsoTimestamp;
  convertJobId?: string;
}

function intendedAudit(
  kind: AuditEvent['kind'],
  job: Job,
  actorGuardianId: GuardianId,
  at: IsoTimestamp,
  metadata: AuditEvent['metadata'],
): AuditEvent {
  return {
    id: `audit_intended_${kind}_${job.id}`,
    familyId: job.familyId,
    actorGuardianId,
    kind,
    at,
    subjectRef: job.id,
    metadata,
  };
}

function asConvertJob(job: Job | undefined, familyId?: FamilyId): ConvertTransitionResult {
  if (!job || job.kind !== 'convert') {
    return { ok: false, errorCode: 'not_found' };
  }
  if (familyId !== undefined && job.familyId !== familyId) {
    return { ok: false, errorCode: 'wrong_family' };
  }
  return { ok: true, job };
}

/**
 * Queue a convert job only with an explicit in-family `targetEnrollmentId`
 * that passes `convertJobMayRun`. Never infers a target from family membership.
 */
export function queueConvertJob(input: ConvertQueueInput): ConvertQueueResult {
  const targetEnrollmentId = input.targetEnrollmentId?.trim() ?? '';
  if (!targetEnrollmentId) {
    return { ok: false, errorCode: 'missing_target_enrollment' };
  }

  if (input.kidProfile && input.kidProfile.id === targetEnrollmentId) {
    return { ok: false, errorCode: 'kid_profile_not_target' };
  }

  const convertJob: Job = {
    id: input.convertJobId ?? `convert_${input.familyId}_${targetEnrollmentId}`,
    familyId: input.familyId,
    requestedByGuardianId: input.requestedByGuardianId,
    kind: 'convert',
    status: 'queued',
    targetEnrollmentId,
    sourceRef: input.sourceRef ?? null,
    createdAt: input.at,
    updatedAt: input.at,
    errorCode: null,
  };

  if (
    !input.enrollment ||
    !input.consent ||
    !convertJobMayRun(convertJob, input.enrollment, input.consent)
  ) {
    const refused = intendedAudit(
      'convert_refused',
      convertJob,
      input.requestedByGuardianId,
      input.at,
      {
        reason: 'convertJobMayRun',
        targetEnrollmentId,
      },
    );
    return { ok: false, errorCode: 'convert_refused', intendedAudit: refused };
  }

  const queued = intendedAudit(
    'convert_queued',
    convertJob,
    input.requestedByGuardianId,
    input.at,
    {
      targetEnrollmentId,
    },
  );
  return { ok: true, job: convertJob, intendedAudit: queued };
}

/** queued → running. No inference. */
export function startConvertJob(
  job: Job | undefined,
  at: IsoTimestamp,
  familyId?: FamilyId,
): ConvertTransitionResult {
  const checked = asConvertJob(job, familyId);
  if (!checked.ok) {
    return checked;
  }
  if (checked.job.status !== 'queued') {
    return { ok: false, errorCode: 'illegal_job_status' };
  }
  return { ok: true, job: { ...checked.job, status: 'running', updatedAt: at } };
}

/** running → needs_review (success stub for guardian review-api). No ML. */
export function completeConvertJob(
  job: Job | undefined,
  at: IsoTimestamp,
  familyId?: FamilyId,
): ConvertTransitionResult {
  const checked = asConvertJob(job, familyId);
  if (!checked.ok) {
    return checked;
  }
  if (checked.job.status !== 'running') {
    return { ok: false, errorCode: 'illegal_job_status' };
  }
  return { ok: true, job: { ...checked.job, status: 'needs_review', updatedAt: at } };
}

/** running → failed. Stub failure; no inference. */
export function failConvertJob(
  job: Job | undefined,
  at: IsoTimestamp,
  familyId?: FamilyId,
  errorCode = 'convert_failed',
): ConvertTransitionResult {
  const checked = asConvertJob(job, familyId);
  if (!checked.ok) {
    return checked;
  }
  if (checked.job.status !== 'running') {
    return { ok: false, errorCode: 'illegal_job_status' };
  }
  return {
    ok: true,
    job: { ...checked.job, status: 'failed', errorCode, updatedAt: at },
  };
}

/** queued | running → cancelled. Terminal / review statuses are not cancellable. */
export function cancelConvertJob(
  job: Job | undefined,
  at: IsoTimestamp,
  familyId?: FamilyId,
): ConvertTransitionResult {
  const checked = asConvertJob(job, familyId);
  if (!checked.ok) {
    return checked;
  }
  if (checked.job.status !== 'queued' && checked.job.status !== 'running') {
    return { ok: false, errorCode: 'illegal_job_status' };
  }
  return { ok: true, job: { ...checked.job, status: 'cancelled', updatedAt: at } };
}
