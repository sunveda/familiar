/**
 * In-memory metadata-only audit log (process lifetime).
 *
 * Not durable — a production store is TBD. Never persist biometrics,
 * embeddings, samples, media bytes, or secrets on an AuditEvent.
 */

import type {
  AuditEvent,
  AuditEventId,
  AuditEventKind,
  FamilyId,
  GuardianId,
  IsoTimestamp,
  JobId,
} from './types';

export const AUDIT_EVENT_KINDS: readonly AuditEventKind[] = [
  'consent_granted',
  'consent_revoked',
  'enrollment_revoked',
  'enrollment_deleted',
  'convert_refused',
  'convert_queued',
  'review_approved',
  'review_rejected',
];

/**
 * Metadata / payload keys that look like biometric or secret content.
 * Matched case-insensitively after stripping `_` / `-`.
 */
export const FORBIDDEN_AUDIT_KEYS: readonly string[] = [
  'embedding',
  'embeddings',
  'sample',
  'samples',
  'samplebytes',
  'audio',
  'audiobytes',
  'wav',
  'face',
  'facebytes',
  'faceimage',
  'image',
  'imagebytes',
  'video',
  'media',
  'mediabytes',
  'privatekey',
  'secret',
  'password',
  'token',
  'apikey',
  'credential',
  'npy',
  'onnx',
  'weights',
  'model',
];

export type AuditAppendErrorCode = 'missing_required_field' | 'invalid_kind' | 'forbidden_payload';

export type AuditAppendResult =
  { ok: true; event: AuditEvent } | { ok: false; errorCode: AuditAppendErrorCode };

export interface CreateAuditEventInput {
  kind: AuditEventKind;
  familyId: FamilyId;
  actorGuardianId: GuardianId | null;
  at: IsoTimestamp;
  subjectRef: string | null;
  metadata?: AuditEvent['metadata'];
  id?: AuditEventId;
}

export interface AuditLog {
  append(event: AuditEvent): AuditAppendResult;
  listByFamily(familyId: FamilyId): AuditEvent[];
  listByJob(jobId: JobId): AuditEvent[];
}

const KIND_SET = new Set<string>(AUDIT_EVENT_KINDS);
const FORBIDDEN_KEY_SET = new Set(FORBIDDEN_AUDIT_KEYS);

export function normalizeAuditKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

export function isForbiddenAuditKey(key: string): boolean {
  return FORBIDDEN_KEY_SET.has(normalizeAuditKey(key));
}

function isPrimitiveMetadataValue(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function collectObjectKeys(value: unknown, into: string[]): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    into.push(key);
    collectObjectKeys(child, into);
  }
}

export function createAuditEvent(input: CreateAuditEventInput): AuditEvent {
  const subject = input.subjectRef ?? 'none';
  return {
    id: input.id ?? `audit_intended_${input.kind}_${subject}`,
    familyId: input.familyId,
    actorGuardianId: input.actorGuardianId,
    kind: input.kind,
    at: input.at,
    subjectRef: input.subjectRef,
    metadata: { ...(input.metadata ?? {}) },
  };
}

export function validateAuditEvent(event: AuditEvent): AuditAppendResult {
  if (
    typeof event.id !== 'string' ||
    event.id.trim() === '' ||
    typeof event.familyId !== 'string' ||
    event.familyId.trim() === '' ||
    typeof event.at !== 'string' ||
    event.at.trim() === ''
  ) {
    return { ok: false, errorCode: 'missing_required_field' };
  }
  if (typeof event.kind !== 'string' || !KIND_SET.has(event.kind)) {
    return { ok: false, errorCode: 'invalid_kind' };
  }
  if (event.actorGuardianId !== null && typeof event.actorGuardianId !== 'string') {
    return { ok: false, errorCode: 'missing_required_field' };
  }
  if (event.subjectRef !== null && typeof event.subjectRef !== 'string') {
    return { ok: false, errorCode: 'missing_required_field' };
  }
  if (
    event.metadata === null ||
    typeof event.metadata !== 'object' ||
    Array.isArray(event.metadata)
  ) {
    return { ok: false, errorCode: 'missing_required_field' };
  }

  const keys = Object.keys(event);
  collectObjectKeys(event.metadata, keys);
  if (keys.some((key) => isForbiddenAuditKey(key))) {
    return { ok: false, errorCode: 'forbidden_payload' };
  }

  for (const value of Object.values(event.metadata)) {
    if (!isPrimitiveMetadataValue(value)) {
      return { ok: false, errorCode: 'forbidden_payload' };
    }
  }

  return { ok: true, event };
}

function cloneEvent(event: AuditEvent): AuditEvent {
  return {
    id: event.id,
    familyId: event.familyId,
    actorGuardianId: event.actorGuardianId,
    kind: event.kind,
    at: event.at,
    subjectRef: event.subjectRef,
    metadata: { ...event.metadata },
  };
}

/**
 * Process-lifetime append-only log. A new instance is empty; nothing is written
 * to disk or a remote sink.
 */
export function createAuditLog(): AuditLog {
  const events: AuditEvent[] = [];

  return {
    append(event: AuditEvent): AuditAppendResult {
      const checked = validateAuditEvent(event);
      if (!checked.ok) {
        return checked;
      }
      const stored = cloneEvent(checked.event);
      events.push(stored);
      return { ok: true, event: cloneEvent(stored) };
    },
    listByFamily(familyId: FamilyId): AuditEvent[] {
      return events.filter((event) => event.familyId === familyId).map(cloneEvent);
    },
    listByJob(jobId: JobId): AuditEvent[] {
      return events.filter((event) => event.subjectRef === jobId).map(cloneEvent);
    },
  };
}

export function persistAudit(log: AuditLog | undefined, event: AuditEvent): AuditAppendResult {
  if (!log) {
    return { ok: true, event };
  }
  return log.append(event);
}
