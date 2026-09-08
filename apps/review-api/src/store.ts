import type {
  AuditEvent,
  ConsentRecord,
  ConsentRecordId,
  Enrollment,
  EnrollmentId,
  FamilyId,
  Job,
  JobId,
} from '../../../packages/shared/src/index';

/**
 * In-memory stub store. Not production persistence.
 * Intended audit events are recorded for tests; there is still no audit store.
 */
export interface ReviewStore {
  listJobs(familyId: FamilyId): Job[];
  getJob(jobId: JobId): Job | undefined;
  putJob(job: Job): void;
  getEnrollment(id: EnrollmentId): Enrollment | undefined;
  putEnrollment(enrollment: Enrollment): void;
  getConsent(id: ConsentRecordId): ConsentRecord | undefined;
  putConsent(consent: ConsentRecord): void;
  recordIntendedAudit(event: AuditEvent): void;
  intendedAudits(): readonly AuditEvent[];
}

export interface MemorySeed {
  jobs?: Job[];
  enrollments?: Enrollment[];
  consents?: ConsentRecord[];
}

export function createMemoryStore(seed: MemorySeed = {}): ReviewStore {
  const jobs = new Map<JobId, Job>();
  const enrollments = new Map<EnrollmentId, Enrollment>();
  const consents = new Map<ConsentRecordId, ConsentRecord>();
  const audits: AuditEvent[] = [];

  for (const job of seed.jobs ?? []) {
    jobs.set(job.id, job);
  }
  for (const enrollment of seed.enrollments ?? []) {
    enrollments.set(enrollment.id, enrollment);
  }
  for (const consent of seed.consents ?? []) {
    consents.set(consent.id, consent);
  }

  return {
    listJobs(familyId: FamilyId): Job[] {
      return [...jobs.values()].filter((job) => job.familyId === familyId);
    },
    getJob(jobId: JobId): Job | undefined {
      return jobs.get(jobId);
    },
    putJob(job: Job): void {
      jobs.set(job.id, job);
    },
    getEnrollment(id: EnrollmentId): Enrollment | undefined {
      return enrollments.get(id);
    },
    putEnrollment(enrollment: Enrollment): void {
      enrollments.set(enrollment.id, enrollment);
    },
    getConsent(id: ConsentRecordId): ConsentRecord | undefined {
      return consents.get(id);
    },
    putConsent(consent: ConsentRecord): void {
      consents.set(consent.id, consent);
    },
    recordIntendedAudit(event: AuditEvent): void {
      audits.push(event);
    },
    intendedAudits(): readonly AuditEvent[] {
      return audits;
    },
  };
}
