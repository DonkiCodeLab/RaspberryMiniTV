/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TransferEngine } from '../src/engine.ts';
import type { Dependencies, Job, Pending, Outcome } from '../src/engine.ts';
import { parsePairing, validateReceipt, manifest, csvCell } from '../src/protocol.ts';
const server = 'http://192.168.1.10:5000';
const qr = `minitvphotos://pair?v=1&server=${encodeURIComponent(server)}&code=${'x'.repeat(43)}`;
const connection = { server, token: 't'.repeat(43), expiresAt: Date.now() / 1000 + 600 };
function fixture() {
  const disk: { job: Job | null; pending: Pending | null; outcomes: Outcome[] } = { job: null, pending: null, outcomes: [] };
  let existing = false; let failAfterCommit = false; let savesFail = false; let exportCount = 0;
  const receipts = new Map<string, unknown>(); const calls: ReturnType<typeof manifest>[] = [];
  const deps: Dependencies = {
    load: async () => structuredClone({ ...disk, connection }), saveConnection: async () => {}, uuid: () => 'session-1',
    saveJob: async job => { disk.job = structuredClone(job); disk.pending = null; disk.outcomes = []; },
    savePending: async p => { disk.pending = structuredClone(p); },
    saveOutcome: async o => { if (savesFail) throw new Error('disk full'); disk.outcomes.push(structuredClone(o)); disk.pending = null; },
    claim: async () => connection, listPhotos: async () => ({ ids: ['one','two'], limited: false }),
    exportPhoto: async (id, index) => { exportCount++; return { index, name: id + '.jpg', uri: 'file://' + id, digest: id.repeat(32), metadata: {} }; },
    removeFile: async () => {}, isMissing: async () => !existing,
    upload: async (_c, _p, data) => {
      calls.push(data);
      if (!receipts.has(data.batch)) receipts.set(data.batch, { imported: existing ? 0 : 1, duplicates: existing ? 1 : 0, rejected: [] });
      if (failAfterCommit) { failAfterCommit = false; existing = true; throw new Error('lost response'); }
      return receipts.get(data.batch);
    },
    keepAwake: async () => {}, isActive: () => true, writeReport: async csv => csv
  };
  return { deps, disk, calls, get exportCount() { return exportCount; }, setExisting: () => { existing = true; },
    loseReceipt: () => { failAfterCommit = true; }, failSave: () => { savesFail = true; } };
}
async function done(engine: TransferEngine) {
  for (let i = 0; i < 100; i++) { if (!(await engine.getState()).running) return; await new Promise(r => setTimeout(r, 1)); }
  throw new Error('worker did not settle');
}
test('QR acepta origen y puerto; rechaza credenciales, duplicados y localhost', () => {
  assert.deepEqual(parsePairing(qr), { server, code: 'x'.repeat(43) });
  for (const bad of [qr + '&v=1', qr + '#oops', qr.replace('pair?', 'pair/path?'), qr.replace(encodeURIComponent(server), encodeURIComponent('http://user:pass@host:5000')), qr.replace(encodeURIComponent(server), encodeURIComponent('http://localhost:5000'))]) assert.throws(() => parsePairing(bad));
});
test('recibo inválido no cuenta como foto terminada', () => {
  for (const bad of [null, {}, { imported: 2, duplicates: 0 }, { imported: -1, duplicates: 2 }, { imported: 0, duplicates: 0, rejected: [{ index: 1, error: 'x' }] }]) assert.throws(() => validateReceipt(bad));
});
test('conectar no envía fotos; preparar importa y refleja nuevas y progreso', async () => {
  const f = fixture(); const engine = new TransferEngine(f.deps);
  await engine.connect(qr); assert.equal(f.calls.length, 0);
  await engine.prepare(); await done(engine);
  const state = await engine.getState(); assert.equal(state.imported, 2); assert.equal(state.percentage, 1); assert.equal(state.canResume, false);
});
test('duplicados solo envían metadatos vacíos y cuentan como existentes', async () => {
  const f = fixture(); f.setExisting(); const engine = new TransferEngine(f.deps);
  await engine.prepare(); await done(engine);
  assert.equal((await engine.getState()).existing, 2);
  assert.deepEqual(f.calls[0].fileIndices, []); assert.deepEqual(f.calls[0].records, [{ metadata: null, raw: null }]);
});
test('una respuesta perdida sobrevive al reinicio y conserva el recibo original sin duplicar', async () => {
  const f = fixture(); f.loseReceipt(); const first = new TransferEngine(f.deps);
  await first.prepare(); await done(first);
  assert.equal((await first.getState()).imported, 0); assert.ok(f.disk.pending);
  const restarted = new TransferEngine(f.deps); await restarted.start(); await done(restarted);
  assert.equal(f.calls[0].batch, f.calls[1].batch); assert.equal(f.exportCount, 2);
  const state = await restarted.getState(); assert.equal(state.imported, 1); assert.equal(state.existing, 1); assert.equal(state.failed, 0);
});
test('no avanza si falla el guardado local después de confirmar la foto', async () => {
  const f = fixture(); f.failSave(); const engine = new TransferEngine(f.deps);
  await engine.prepare(); await done(engine);
  assert.ok(f.disk.pending); assert.equal((await engine.getState()).percentage, 0); assert.match((await engine.getState()).error, /disk full/);
});
test('pausa aborta la red y no prepara la siguiente foto', async () => {
  const f = fixture(); let entered!: () => void; const uploading = new Promise<void>(r => entered = r);
  f.deps.upload = async (_c,_p,_data,signal) => { entered(); return new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); };
  const engine = new TransferEngine(f.deps); await engine.prepare(); await uploading; await engine.pause();
  assert.equal(f.exportCount, 1); const state = await engine.getState(); assert.equal(state.running, false); assert.equal(state.failed, 0); assert.equal(state.canResume, true); assert.equal(state.error, '');
});
test('foto ilegible no bloquea las siguientes; informa error real', async () => {
  const f = fixture(); const original = f.deps.exportPhoto;
  f.deps.exportPhoto = async (id,index) => { if (index === 0) throw new Error('No disponible'); return original(id,index); };
  const engine = new TransferEngine(f.deps); await engine.prepare(); await done(engine);
  const state = await engine.getState(); assert.equal(state.failed, 1); assert.equal(state.imported, 1); assert.equal(state.percentage, 1);
});
test('CSV neutraliza fórmulas y escapa comillas', () => { assert.equal(csvCell('=test'), '"\'=test"'); assert.equal(csvCell('a"b'), '"a""b"'); });
