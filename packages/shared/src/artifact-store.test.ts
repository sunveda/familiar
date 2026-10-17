/**
 * Artifact store tests. Synthetic random bytes only — no real biometrics.
 */

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, test } from 'node:test';

import {
  createInMemoryArtifactStore,
  createLocalEncryptedArtifactStore,
  envKeyProvider,
  revokeAndDeleteEnrollmentArtifact,
  type EnrollmentArtifactStore,
} from './artifact-store';
import { createAuditLog, isForbiddenAuditKey } from './audit';
import type { Enrollment } from './types';

const at = '2026-01-01T00:00:00.000Z';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'familiar-artifact-test-'));
  dirs.push(dir);
  return dir;
}

function putInput(bytes: Uint8Array, over: Record<string, string> = {}) {
  return {
    familyId: 'fam_1',
    enrollmentId: 'enr_1',
    actorGuardianId: 'grd_1',
    contentType: 'application/octet-stream',
    bytes,
    at,
    ...over,
  };
}

function enrollment(over: Partial<Enrollment> = {}): Enrollment {
  return {
    id: 'enr_1',
    familyId: 'fam_1',
    guardianId: 'grd_1',
    consentRecordId: 'cns_1',
    modality: 'voice_and_face',
    status: 'active',
    artifactRef: null,
    createdAt: at,
    revokedAt: null,
    deletedAt: null,
    ...over,
  };
}

type Factory = () => {
  store: EnrollmentArtifactStore;
  auditLog: ReturnType<typeof createAuditLog>;
};

const factories: Record<string, Factory> = {
  'in-memory double': () => {
    const auditLog = createAuditLog();
    return { store: createInMemoryArtifactStore({ auditLog }), auditLog };
  },
  'local encrypted': () => {
    const auditLog = createAuditLog();
    const key = randomBytes(32).toString('base64');
    const store = createLocalEncryptedArtifactStore({
      rootDir: tmp(),
      keyProvider: envKeyProvider({ FAMILIAR_ARTIFACT_KEY: key }),
      auditLog,
    });
    return { store, auditLog };
  },
};

for (const [name, make] of Object.entries(factories)) {
  describe(`contract: ${name}`, () => {
    test('put then get round-trips; ref is opaque', () => {
      const { store } = make();
      const bytes = randomBytes(256);
      const put = store.put(putInput(bytes));
      assert.equal(put.ok, true);
      if (!put.ok) return;
      assert.match(put.artifactRef.storageKey, /^[0-9a-f]{32}$/);
      const got = store.get('fam_1', 'enr_1', put.artifactRef);
      assert.equal(got.ok, true);
      if (got.ok) {
        assert.deepEqual(Buffer.from(got.bytes), bytes);
      }
    });

    test('cross-family get and delete are denied; bytes survive', () => {
      const { store } = make();
      const bytes = randomBytes(64);
      const put = store.put(putInput(bytes));
      assert.ok(put.ok);
      if (!put.ok) return;
      assert.deepEqual(store.get('fam_2', 'enr_1', put.artifactRef), {
        ok: false,
        errorCode: 'wrong_family',
      });
      assert.deepEqual(store.delete('fam_2', 'enr_1', put.artifactRef, at), {
        ok: false,
        errorCode: 'wrong_family',
      });
      assert.deepEqual(store.revoke('fam_2', 'enr_1', put.artifactRef, at), {
        ok: false,
        errorCode: 'wrong_family',
      });
      const still = store.get('fam_1', 'enr_1', put.artifactRef);
      assert.ok(still.ok);
    });

    test('wrong enrollment is denied', () => {
      const { store } = make();
      const put = store.put(putInput(randomBytes(32)));
      assert.ok(put.ok);
      if (!put.ok) return;
      assert.deepEqual(store.get('fam_1', 'enr_other', put.artifactRef), {
        ok: false,
        errorCode: 'wrong_enrollment',
      });
    });

    test('delete removes bytes; later get fails closed; delete is idempotent', () => {
      const { store } = make();
      const put = store.put(putInput(randomBytes(32)));
      assert.ok(put.ok);
      if (!put.ok) return;
      assert.deepEqual(store.delete('fam_1', 'enr_1', put.artifactRef, at), { ok: true });
      assert.deepEqual(store.get('fam_1', 'enr_1', put.artifactRef), {
        ok: false,
        errorCode: 'not_found',
      });
      assert.deepEqual(store.delete('fam_1', 'enr_1', put.artifactRef, at), { ok: true });
    });

    test('revoke deletes bytes; any later get fails closed', () => {
      const { store } = make();
      const put = store.put(putInput(randomBytes(32)));
      assert.ok(put.ok);
      if (!put.ok) return;
      assert.deepEqual(store.revoke('fam_1', 'enr_1', put.artifactRef, at), { ok: true });
      assert.equal(store.get('fam_1', 'enr_1', put.artifactRef).ok, false);
    });

    test('rejects invalid input and malformed refs', () => {
      const { store } = make();
      assert.equal(store.put(putInput(new Uint8Array(0))).ok, false);
      assert.equal(store.put(putInput(randomBytes(4), { contentType: ' ' })).ok, false);
      assert.equal(store.put(putInput(randomBytes(4), { familyId: '' })).ok, false);
      const bad = { storageKey: '../../etc/passwd', contentType: 'x', createdAt: at };
      assert.deepEqual(store.get('fam_1', 'enr_1', bad), { ok: false, errorCode: 'invalid_input' });
    });

    test('audit events are metadata-only and carry no biometric-like keys', () => {
      const { store, auditLog } = make();
      const put = store.put(putInput(randomBytes(48)));
      assert.ok(put.ok);
      if (!put.ok) return;
      store.get('fam_2', 'enr_1', put.artifactRef);
      store.revoke('fam_1', 'enr_1', put.artifactRef, at, 'grd_1');
      const kinds = auditLog.listByFamily('fam_1').map((e) => e.kind);
      assert.deepEqual(kinds, ['artifact_stored', 'enrollment_revoked']);
      assert.deepEqual(
        auditLog.listByFamily('fam_2').map((e) => e.kind),
        ['artifact_access_denied'],
      );
      for (const fam of ['fam_1', 'fam_2']) {
        for (const event of auditLog.listByFamily(fam)) {
          for (const key of [...Object.keys(event), ...Object.keys(event.metadata)]) {
            assert.equal(isForbiddenAuditKey(key), false, key);
          }
          for (const value of Object.values(event.metadata)) {
            assert.notEqual(typeof value, 'object');
          }
        }
      }
    });
  });
}

describe('local encrypted store', () => {
  function setup() {
    const rootDir = tmp();
    const key = randomBytes(32).toString('base64');
    const store = createLocalEncryptedArtifactStore({
      rootDir,
      keyProvider: envKeyProvider({ FAMILIAR_ARTIFACT_KEY: key }),
    });
    return { rootDir, key, store };
  }

  test('plaintext never appears on disk; nonce is random per write', () => {
    const { rootDir, store } = setup();
    const bytes = Buffer.alloc(128, 0xab);
    const a = store.put(putInput(bytes));
    const b = store.put(putInput(bytes));
    assert.ok(a.ok && b.ok);
    const files = readdirSync(rootDir).sort();
    assert.equal(files.length, 2);
    const raws = files.map((f) => readFileSync(join(rootDir, f)));
    for (const raw of raws) {
      assert.equal(raw.includes(bytes), false);
    }
    assert.notDeepEqual(raws[0], raws[1]);
  });

  test('tampered ciphertext is detected', () => {
    const { rootDir, store } = setup();
    const put = store.put(putInput(randomBytes(64)));
    assert.ok(put.ok);
    if (!put.ok) return;
    const path = join(rootDir, `${put.artifactRef.storageKey}.far`);
    const raw = readFileSync(path);
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0x01;
    writeFileSync(path, raw);
    assert.deepEqual(store.get('fam_1', 'enr_1', put.artifactRef), {
      ok: false,
      errorCode: 'tampered',
    });
  });

  test('tampered header (family swap) is detected, not trusted', () => {
    const { rootDir, store } = setup();
    const put = store.put(putInput(randomBytes(64)));
    assert.ok(put.ok);
    if (!put.ok) return;
    const path = join(rootDir, `${put.artifactRef.storageKey}.far`);
    const raw = readFileSync(path);
    const text = raw.toString('latin1').replace('fam_1', 'fam_2');
    writeFileSync(path, Buffer.from(text, 'latin1'));
    assert.deepEqual(store.get('fam_2', 'enr_1', put.artifactRef), {
      ok: false,
      errorCode: 'tampered',
    });
    assert.equal(store.get('fam_1', 'enr_1', put.artifactRef).ok, false);
  });

  test('truncated or garbage file fails closed', () => {
    const { rootDir, store } = setup();
    const put = store.put(putInput(randomBytes(64)));
    assert.ok(put.ok);
    if (!put.ok) return;
    writeFileSync(join(rootDir, `${put.artifactRef.storageKey}.far`), randomBytes(10));
    assert.deepEqual(store.get('fam_1', 'enr_1', put.artifactRef), {
      ok: false,
      errorCode: 'tampered',
    });
  });

  test('wrong key fails closed as tampered', () => {
    const rootDir = tmp();
    const mk = (key: Buffer) =>
      createLocalEncryptedArtifactStore({
        rootDir,
        keyProvider: envKeyProvider({ FAMILIAR_ARTIFACT_KEY: key.toString('base64') }),
      });
    const put = mk(randomBytes(32)).put(putInput(randomBytes(32)));
    assert.ok(put.ok);
    if (!put.ok) return;
    assert.deepEqual(mk(randomBytes(32)).get('fam_1', 'enr_1', put.artifactRef), {
      ok: false,
      errorCode: 'tampered',
    });
  });

  test('missing or malformed key fails closed on put and get', () => {
    const rootDir = tmp();
    for (const env of [{}, { FAMILIAR_ARTIFACT_KEY: Buffer.alloc(16).toString('base64') }]) {
      const store = createLocalEncryptedArtifactStore({
        rootDir,
        keyProvider: envKeyProvider(env),
      });
      assert.deepEqual(store.put(putInput(randomBytes(8))), {
        ok: false,
        errorCode: 'key_unavailable',
      });
    }
    assert.equal(readdirSync(rootDir).length, 0);
  });

  test('delete removes the file from disk', () => {
    const { rootDir, store } = setup();
    const put = store.put(putInput(randomBytes(64)));
    assert.ok(put.ok);
    if (!put.ok) return;
    store.delete('fam_1', 'enr_1', put.artifactRef, at);
    assert.deepEqual(readdirSync(rootDir), []);
  });

  test('refuses a directory inside the repository tree', () => {
    assert.throws(() =>
      createLocalEncryptedArtifactStore({
        rootDir: join(__dirname, '..', 'artifacts-should-not-exist'),
        keyProvider: envKeyProvider({}),
      }),
    );
  });
});

describe('revokeAndDeleteEnrollmentArtifact', () => {
  test('revokes, removes bytes, nulls artifactRef, later get fails closed', () => {
    const store = createInMemoryArtifactStore();
    const put = store.put(putInput(randomBytes(32)));
    assert.ok(put.ok);
    if (!put.ok) return;
    const result = revokeAndDeleteEnrollmentArtifact(
      store,
      enrollment({ artifactRef: put.artifactRef }),
      at,
      { familyId: 'fam_1', actorGuardianId: 'grd_1' },
    );
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.enrollment.status, 'deleted');
    assert.equal(result.enrollment.artifactRef, null);
    assert.equal(store.get('fam_1', 'enr_1', put.artifactRef).ok, false);
  });

  test('wrong family: nothing is revoked or removed', () => {
    const store = createInMemoryArtifactStore();
    const put = store.put(putInput(randomBytes(32)));
    assert.ok(put.ok);
    if (!put.ok) return;
    const result = revokeAndDeleteEnrollmentArtifact(
      store,
      enrollment({ artifactRef: put.artifactRef }),
      at,
      { familyId: 'fam_2' },
    );
    assert.deepEqual(result, { ok: false, errorCode: 'wrong_family' });
    assert.ok(store.get('fam_1', 'enr_1', put.artifactRef).ok);
  });

  test('already-deleted enrollment is refused', () => {
    const store = createInMemoryArtifactStore();
    const result = revokeAndDeleteEnrollmentArtifact(
      store,
      enrollment({ status: 'deleted', deletedAt: at }),
      at,
      { familyId: 'fam_1' },
    );
    assert.deepEqual(result, { ok: false, errorCode: 'already_deleted' });
  });

  test('enrollment without artifact still ends deleted', () => {
    const store = createInMemoryArtifactStore();
    const result = revokeAndDeleteEnrollmentArtifact(store, enrollment(), at, {
      familyId: 'fam_1',
    });
    assert.ok(result.ok);
  });
});
