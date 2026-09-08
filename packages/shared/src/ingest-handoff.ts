/**
 * Optional ingest → convert handoff.
 *
 * Convert is never automatic: the caller must supply explicit
 * `targetEnrollmentId`. Canonical fail-closed check is `convertJobMayRun`.
 * KidProfile is never an enrollment target.
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

export type IngestHandoffErrorCode =
  | 'not_found'
  | 'wrong_family'
  | 'illegal_job_status'
  | 'missing_target_enrollment'
  | 'convert_refused'
  | 'kid_profile_not_target';

export type IngestHandoffResult =
  | {
      ok: true;
      job: Job;
      intendedAudit: AuditEvent;
    }
  | { ok: false; errorCode: IngestHandoffErrorCode; intendedAudit?: AuditEvent };

export interface IngestHandoffInput {
  ingestJob: Job | undefined;
  /** Required. Convert is not inferred from family membership. */
  targetEnrollmentId: string | null | undefined;
  enrollment: Enrollment | undefined;
  consent: ConsentRecord | undefined;
  /** If this id matches a KidProfile, refuse — kids are not convert targets. */
  kidProfile: KidProfile | undefined;
  familyId?: FamilyId;
  requestedByGuardianId: GuardianId;
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

/**
 * Queue a convert job from a *staged* ingest job.
 *
 * Refuses when `targetEnrollmentId` is missing, enrollment/consent cannot
 * pass `convertJobMayRun`, the ingest job is not staged, or the id is a
 * KidProfile rather than an Enrollment.
 */
export function queueConvertFromIngest(input: IngestHandoffInput): IngestHandoffResult {
  const ingestJob = input.ingestJob;
  if (!ingestJob || ingestJob.kind !== 'ingest') {
    return { ok: false, errorCode: 'not_found' };
  }
  if (input.familyId !== undefined && ingestJob.familyId !== input.familyId) {
    return { ok: false, errorCode: 'wrong_family' };
  }
  if (ingestJob.status !== 'staged') {
    return { ok: false, errorCode: 'illegal_job_status' };
  }

  const targetEnrollmentId = input.targetEnrollmentId?.trim() ?? '';
  if (!targetEnrollmentId) {
    return { ok: false, errorCode: 'missing_target_enrollment' };
  }

  if (input.kidProfile && input.kidProfile.id === targetEnrollmentId) {
    return { ok: false, errorCode: 'kid_profile_not_target' };
  }

  const convertJob: Job = {
    id: input.convertJobId ?? `convert_from_${ingestJob.id}`,
    familyId: ingestJob.familyId,
    requestedByGuardianId: input.requestedByGuardianId,
    kind: 'convert',
    status: 'queued',
    targetEnrollmentId,
    sourceRef: ingestJob.sourceRef,
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
        ingestJobId: ingestJob.id,
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
      ingestJobId: ingestJob.id,
      targetEnrollmentId,
    },
  );
  return { ok: true, job: convertJob, intendedAudit: queued };
}
