/**
 * Enrollment artifact store (interface + encrypted local impl + test double).
 *
 * Artifact bytes (voice/face enrollment material) never enter git, `Enrollment`
 * records, or the `AuditLog`. Callers hold only the opaque `EnrollmentArtifactRef`.
 *
 * Fail closed: every failure is `{ ok: false, errorCode }`. A deleted or revoked
 * artifact can never be read again. Access is family-scoped and enrollment-scoped.
 *
 * Local implementation: AES-256-GCM, random 96-bit nonce per write, key from a
 * `ArtifactKeyProvider` (env var by default; never in git), files only under a
 * configured directory that must be outside any git worktree. The family /
 * enrollment / content-type header is authenticated as GCM AAD, so tampering with
 * the header or ciphertext is detected.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createAuditEvent, persistAudit, type AuditLog } from './audit';
import { deleteEnrollment, revokeEnrollment } from './enrollment';
import type {
  AuditEventKind,
  Enrollment,
  EnrollmentArtifactRef,
  EnrollmentId,
  FamilyId,
  GuardianId,
  IsoTimestamp,
} from './types';

export const ARTIFACT_KEY_ENV = 'FAMILIAR_ARTIFACT_KEY';

const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAGIC = Buffer.from('FAR1');
const STORAGE_KEY_RE = /^[0-9a-f]{32}$/;

export type ArtifactStoreErrorCode =
  | 'invalid_input'
  | 'key_unavailable'
  | 'not_found'
  | 'wrong_family'
  | 'wrong_enrollment'
  | 'tampered'
  | 'io_error';

export type ArtifactStoreResult<T> =
  ({ ok: true } & T) | { ok: false; errorCode: ArtifactStoreErrorCode };

export interface PutArtifactInput {
  familyId: FamilyId;
  enrollmentId: EnrollmentId;
  actorGuardianId: GuardianId | null;
  contentType: string;
  bytes: Uint8Array;
  at: IsoTimestamp;
}

export interface EnrollmentArtifactStore {
  put(input: PutArtifactInput): ArtifactStoreResult<{ artifactRef: EnrollmentArtifactRef }>;
  get(
    familyId: FamilyId,
    enrollmentId: EnrollmentId,
    ref: EnrollmentArtifactRef,
  ): ArtifactStoreResult<{ bytes: Uint8Array; contentType: string }>;
  /** Overwrite + remove. Idempotent for an already-removed ref. */
  delete(
    familyId: FamilyId,
    enrollmentId: EnrollmentId,
    ref: EnrollmentArtifactRef,
    at: IsoTimestamp,
    actorGuardianId?: GuardianId | null,
  ): ArtifactStoreResult<Record<never, never>>;
  /** Revoke == delete the bytes; any later get fails closed. */
  revoke(
    familyId: FamilyId,
    enrollmentId: EnrollmentId,
    ref: EnrollmentArtifactRef,
    at: IsoTimestamp,
    actorGuardianId?: GuardianId | null,
  ): ArtifactStoreResult<Record<never, never>>;
}

export interface ArtifactKeyProvider {
  /** 32-byte AES-256 key. Throw if unavailable (store fails closed). */
  getKey(): Uint8Array;
}

/** Reads a base64 32-byte key from the environment. Never logs the value. */
export function envKeyProvider(
  env: Record<string, string | undefined> = process.env,
  name: string = ARTIFACT_KEY_ENV,
): ArtifactKeyProvider {
  return {
    getKey(): Uint8Array {
      const raw = env[name];
      if (!raw) {
        throw new Error('artifact key not configured');
      }
      const key = Buffer.from(raw, 'base64');
      if (key.length !== KEY_BYTES) {
        throw new Error('artifact key must be 32 bytes (base64)');
      }
      return key;
    },
  };
}

export interface LocalEncryptedArtifactStoreOptions {
  /** Directory outside the repo tree, e.g. a mounted encrypted volume. */
  rootDir: string;
  keyProvider: ArtifactKeyProvider;
  auditLog?: AuditLog;
}

function isInsideGitWorktree(dir: string): boolean {
  let current = resolve(dir);
  for (;;) {
    if (existsSync(join(current, '.git'))) {
      return true;
    }
    const parent = dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

function newStorageKey(): string {
  return randomBytes(16).toString('hex');
}

function validInput(input: PutArtifactInput): boolean {
  return (
    input.familyId.trim() !== '' &&
    input.enrollmentId.trim() !== '' &&
    input.contentType.trim() !== '' &&
    input.bytes instanceof Uint8Array &&
    input.bytes.length > 0 &&
    input.bytes.length <= MAX_ARTIFACT_BYTES
  );
}

function validRef(ref: EnrollmentArtifactRef): boolean {
  return typeof ref?.storageKey === 'string' && STORAGE_KEY_RE.test(ref.storageKey);
}

/** Metadata-only audit emitter. Never receives bytes, keys, or paths. */
function makeAuditor(log: AuditLog | undefined) {
  let seq = 0;
  return (
    kind: AuditEventKind,
    familyId: FamilyId,
    actor: GuardianId | null,
    at: IsoTimestamp,
    enrollmentId: EnrollmentId,
    metadata: Record<string, string | number | boolean | null>,
  ): void => {
    seq += 1;
    const event = createAuditEvent({
      id: `audit_${kind}_${enrollmentId}_${seq}`,
      kind,
      familyId,
      actorGuardianId: actor,
      at,
      subjectRef: enrollmentId,
      metadata,
    });
    persistAudit(log, event);
  };
}

const nowIso = (): IsoTimestamp => new Date().toISOString();

interface Header {
  v: 1;
  familyId: FamilyId;
  enrollmentId: EnrollmentId;
  contentType: string;
  createdAt: IsoTimestamp;
}

export function createLocalEncryptedArtifactStore(
  options: LocalEncryptedArtifactStoreOptions,
): EnrollmentArtifactStore {
  const rootDir = resolve(options.rootDir);
  if (isInsideGitWorktree(rootDir)) {
    throw new Error('artifact store directory must be outside the repository tree');
  }
  const audit = makeAuditor(options.auditLog);

  const pathFor = (storageKey: string): string => join(rootDir, `${storageKey}.far`);

  function loadKey(): Buffer | null {
    try {
      const key = Buffer.from(options.keyProvider.getKey());
      return key.length === KEY_BYTES ? key : null;
    } catch {
      return null;
    }
  }

  function denied(
    familyId: FamilyId,
    enrollmentId: EnrollmentId,
    at: IsoTimestamp,
    op: string,
    errorCode: ArtifactStoreErrorCode,
  ): { ok: false; errorCode: ArtifactStoreErrorCode } {
    audit('artifact_access_denied', familyId, null, at, enrollmentId, { op, reason: errorCode });
    return { ok: false, errorCode };
  }

  function readParsed(
    path: string,
  ): { header: Header; headerBytes: Buffer; nonce: Buffer; tag: Buffer; ct: Buffer } | null {
    let file: Buffer;
    try {
      file = readFileSync(path);
    } catch {
      return null;
    }
    if (file.length < MAGIC.length + 4 + NONCE_BYTES + TAG_BYTES) {
      return null;
    }
    if (!file.subarray(0, MAGIC.length).equals(MAGIC)) {
      return null;
    }
    const hlen = file.readUInt32BE(MAGIC.length);
    const hStart = MAGIC.length + 4;
    const hEnd = hStart + hlen;
    if (hlen === 0 || hlen > 4096 || file.length < hEnd + NONCE_BYTES + TAG_BYTES) {
      return null;
    }
    const headerBytes = file.subarray(hStart, hEnd);
    let header: Header;
    try {
      header = JSON.parse(headerBytes.toString('utf8')) as Header;
    } catch {
      return null;
    }
    if (
      header?.v !== 1 ||
      typeof header.familyId !== 'string' ||
      typeof header.enrollmentId !== 'string' ||
      typeof header.contentType !== 'string'
    ) {
      return null;
    }
    return {
      header,
      headerBytes,
      nonce: file.subarray(hEnd, hEnd + NONCE_BYTES),
      tag: file.subarray(hEnd + NONCE_BYTES, hEnd + NONCE_BYTES + TAG_BYTES),
      ct: file.subarray(hEnd + NONCE_BYTES + TAG_BYTES),
    };
  }

  function removeFile(path: string): boolean {
    let size: number;
    try {
      size = readFileSync(path).length;
    } catch {
      return false;
    }
    try {
      const fd = openSync(path, 'r+');
      try {
        writeSync(fd, randomBytes(size), 0, size, 0);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      unlinkSync(path);
      return true;
    } catch {
      return false;
    }
  }

  function removeArtifact(
    kind: 'delete' | 'revoke',
    familyId: FamilyId,
    enrollmentId: EnrollmentId,
    ref: EnrollmentArtifactRef,
    at: IsoTimestamp,
    actor: GuardianId | null,
  ): ArtifactStoreResult<Record<never, never>> {
    if (!validRef(ref) || familyId.trim() === '' || enrollmentId.trim() === '') {
      return denied(familyId, enrollmentId, at, kind, 'invalid_input');
    }
    const path = pathFor(ref.storageKey);
    if (!existsSync(path)) {
      return { ok: true }; // already gone: idempotent, nothing readable remains
    }
    const parsed = readParsed(path);
    if (parsed) {
      if (parsed.header.familyId !== familyId) {
        return denied(familyId, enrollmentId, at, kind, 'wrong_family');
      }
      if (parsed.header.enrollmentId !== enrollmentId) {
        return denied(familyId, enrollmentId, at, kind, 'wrong_enrollment');
      }
    }
    // Unparseable/corrupt file: still removed (cannot be decrypted anyway), but only
    // for the caller who holds the ref.
    if (!removeFile(path)) {
      return denied(familyId, enrollmentId, at, kind, 'io_error');
    }
    audit(
      kind === 'revoke' ? 'enrollment_revoked' : 'enrollment_deleted',
      familyId,
      actor,
      at,
      enrollmentId,
      { artifactRemoved: true },
    );
    return { ok: true };
  }

  return {
    put(input) {
      if (!validInput(input)) {
        return { ok: false, errorCode: 'invalid_input' };
      }
      const key = loadKey();
      if (!key) {
        return denied(input.familyId, input.enrollmentId, input.at, 'put', 'key_unavailable');
      }
      const storageKey = newStorageKey();
      const header: Header = {
        v: 1,
        familyId: input.familyId,
        enrollmentId: input.enrollmentId,
        contentType: input.contentType,
        createdAt: input.at,
      };
      const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      cipher.setAAD(headerBytes);
      const ct = Buffer.concat([cipher.update(input.bytes), cipher.final()]);
      const tag = cipher.getAuthTag();
      const lenBuf = Buffer.alloc(4);
      lenBuf.writeUInt32BE(headerBytes.length);
      try {
        mkdirSync(rootDir, { recursive: true, mode: 0o700 });
        const fd = openSync(pathFor(storageKey), 'wx', 0o600);
        try {
          writeSync(fd, Buffer.concat([MAGIC, lenBuf, headerBytes, nonce, tag, ct]));
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      } catch {
        return denied(input.familyId, input.enrollmentId, input.at, 'put', 'io_error');
      }
      audit(
        'artifact_stored',
        input.familyId,
        input.actorGuardianId,
        input.at,
        input.enrollmentId,
        {
          contentType: input.contentType,
          byteLength: input.bytes.length,
        },
      );
      return {
        ok: true,
        artifactRef: { storageKey, contentType: input.contentType, createdAt: input.at },
      };
    },

    get(familyId, enrollmentId, ref) {
      if (!validRef(ref) || familyId.trim() === '' || enrollmentId.trim() === '') {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'invalid_input');
      }
      const parsed = readParsed(pathFor(ref.storageKey));
      if (!parsed) {
        const exists = existsSync(pathFor(ref.storageKey));
        return denied(familyId, enrollmentId, nowIso(), 'get', exists ? 'tampered' : 'not_found');
      }
      if (parsed.header.familyId !== familyId) {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'wrong_family');
      }
      if (parsed.header.enrollmentId !== enrollmentId) {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'wrong_enrollment');
      }
      const key = loadKey();
      if (!key) {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'key_unavailable');
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, parsed.nonce);
        decipher.setAAD(parsed.headerBytes);
        decipher.setAuthTag(parsed.tag);
        const bytes = Buffer.concat([decipher.update(parsed.ct), decipher.final()]);
        return { ok: true, bytes: new Uint8Array(bytes), contentType: parsed.header.contentType };
      } catch {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'tampered');
      }
    },

    delete(familyId, enrollmentId, ref, at, actor = null) {
      return removeArtifact('delete', familyId, enrollmentId, ref, at, actor);
    },

    revoke(familyId, enrollmentId, ref, at, actor = null) {
      return removeArtifact('revoke', familyId, enrollmentId, ref, at, actor);
    },
  };
}

/** Test double: same contract, no encryption, no disk. Synthetic data only. */
export function createInMemoryArtifactStore(options?: {
  auditLog?: AuditLog;
}): EnrollmentArtifactStore {
  const audit = makeAuditor(options?.auditLog);
  const rows = new Map<
    string,
    { familyId: FamilyId; enrollmentId: EnrollmentId; contentType: string; bytes: Uint8Array }
  >();

  function denied(
    familyId: FamilyId,
    enrollmentId: EnrollmentId,
    at: IsoTimestamp,
    op: string,
    errorCode: ArtifactStoreErrorCode,
  ): { ok: false; errorCode: ArtifactStoreErrorCode } {
    audit('artifact_access_denied', familyId, null, at, enrollmentId, { op, reason: errorCode });
    return { ok: false, errorCode };
  }

  function remove(
    kind: 'delete' | 'revoke',
    familyId: FamilyId,
    enrollmentId: EnrollmentId,
    ref: EnrollmentArtifactRef,
    at: IsoTimestamp,
    actor: GuardianId | null,
  ): ArtifactStoreResult<Record<never, never>> {
    if (!validRef(ref)) {
      return denied(familyId, enrollmentId, at, kind, 'invalid_input');
    }
    const row = rows.get(ref.storageKey);
    if (!row) {
      return { ok: true };
    }
    if (row.familyId !== familyId) {
      return denied(familyId, enrollmentId, at, kind, 'wrong_family');
    }
    if (row.enrollmentId !== enrollmentId) {
      return denied(familyId, enrollmentId, at, kind, 'wrong_enrollment');
    }
    row.bytes.fill(0);
    rows.delete(ref.storageKey);
    audit(
      kind === 'revoke' ? 'enrollment_revoked' : 'enrollment_deleted',
      familyId,
      actor,
      at,
      enrollmentId,
      { artifactRemoved: true },
    );
    return { ok: true };
  }

  return {
    put(input) {
      if (!validInput(input)) {
        return { ok: false, errorCode: 'invalid_input' };
      }
      const storageKey = newStorageKey();
      rows.set(storageKey, {
        familyId: input.familyId,
        enrollmentId: input.enrollmentId,
        contentType: input.contentType,
        bytes: new Uint8Array(input.bytes),
      });
      audit(
        'artifact_stored',
        input.familyId,
        input.actorGuardianId,
        input.at,
        input.enrollmentId,
        {
          contentType: input.contentType,
          byteLength: input.bytes.length,
        },
      );
      return {
        ok: true,
        artifactRef: { storageKey, contentType: input.contentType, createdAt: input.at },
      };
    },
    get(familyId, enrollmentId, ref) {
      if (!validRef(ref)) {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'invalid_input');
      }
      const row = rows.get(ref.storageKey);
      if (!row) {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'not_found');
      }
      if (row.familyId !== familyId) {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'wrong_family');
      }
      if (row.enrollmentId !== enrollmentId) {
        return denied(familyId, enrollmentId, nowIso(), 'get', 'wrong_enrollment');
      }
      return { ok: true, bytes: new Uint8Array(row.bytes), contentType: row.contentType };
    },
    delete(familyId, enrollmentId, ref, at, actor = null) {
      return remove('delete', familyId, enrollmentId, ref, at, actor);
    },
    revoke(familyId, enrollmentId, ref, at, actor = null) {
      return remove('revoke', familyId, enrollmentId, ref, at, actor);
    },
  };
}

export type RevokeAndDeleteResult =
  | { ok: true; enrollment: Enrollment }
  | {
      ok: false;
      errorCode: string;
      /** Enrollment is still revoked in status even if byte removal failed. */
      enrollment?: Enrollment;
    };

/**
 * Revoke the enrollment, remove its artifact bytes, then mark it deleted with
 * `artifactRef` nulled. If byte removal fails the enrollment stays `revoked`
 * (never `active`) and the failure is reported; the artifact is not readable
 * through any active path because inference requires `status === 'active'`.
 */
export function revokeAndDeleteEnrollmentArtifact(
  store: EnrollmentArtifactStore,
  enrollment: Enrollment,
  at: IsoTimestamp,
  options: { familyId: FamilyId; actorGuardianId?: GuardianId | null },
): RevokeAndDeleteResult {
  const revoked = revokeEnrollment(enrollment, at, { familyId: options.familyId });
  if (!revoked.ok) {
    return { ok: false, errorCode: revoked.errorCode };
  }
  if (revoked.enrollment.artifactRef !== null) {
    const removed = store.revoke(
      options.familyId,
      revoked.enrollment.id,
      revoked.enrollment.artifactRef,
      at,
      options.actorGuardianId ?? null,
    );
    if (!removed.ok) {
      return { ok: false, errorCode: removed.errorCode, enrollment: revoked.enrollment };
    }
  }
  const deleted = deleteEnrollment(revoked.enrollment, at, { familyId: options.familyId });
  if (!deleted.ok) {
    return { ok: false, errorCode: deleted.errorCode, enrollment: revoked.enrollment };
  }
  return { ok: true, enrollment: deleted.enrollment };
}
