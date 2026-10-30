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
    updateJob: async job => { disk.job = structuredClone(job); },
    savePending: async p => { disk.pending = structuredClone(p); },
    saveOutcome: async o => { if (savesFail) throw new Error('disk full'); disk.outcomes.push(structuredClone(o)); disk.pending = null; },
    claim: async () => connection, listPhotos: async () => ({ ids: ['one','two'], limited: false }),
    exportPhoto: async (id, index) => { exportCount++; return { index, name: id + '.jpg', uri: 'file://' + id, digest: id.repeat(32), metadata: {} }; },
    removeFile: async () => {}, discardPhotos: async () => {}, isMissing: async () => !existing,
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
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
  f.deps.exportPhoto = async (id,index,signal) => { if (index === 0) throw new Error('No disponible'); return original(id,index,signal); };
  const engine = new TransferEngine(f.deps); await engine.prepare(); await done(engine);
  const state = await engine.getState(); assert.equal(state.failed, 1); assert.equal(state.imported, 1); assert.equal(state.percentage, 1);
});
test('CSV neutraliza fórmulas y escapa comillas', () => { assert.equal(csvCell('=test'), '"\'=test"'); assert.equal(csvCell('a"b'), '"a""b"'); });

test('el contador solo incluye confirmaciones y se conserva al pausar, reiniciar y continuar', async () => {
  const f = fixture(); const second = deferred<void>(); const original = f.deps.upload;
  f.deps.upload = async (c,p,data,signal) => {
    if (p.index === 0) return original(c,p,data,signal);
    second.resolve();
    return new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const engine = new TransferEngine(f.deps); await engine.prepare(); await second.promise;
  const sending = await engine.getState();
  assert.equal(sending.imported, 1); assert.equal(sending.percentage, .5);
  assert.equal(sending.canPause, true); assert.equal(sending.canStop, true); assert.equal(sending.canResume, false);
  await engine.pause();
  const restarted = new TransferEngine(f.deps);
  assert.equal((await restarted.getState()).imported, 1);
  assert.equal((await restarted.getState()).canResume, true);
  f.deps.upload = original; await restarted.start(); await done(restarted);
  assert.equal((await restarted.getState()).imported, 2); assert.equal(f.exportCount, 2);
});

test('detener aborta la subida, conserva el informe y no permite reanudar tras reiniciar', async () => {
  const f = fixture(); const second = deferred<void>(); const original = f.deps.upload;
  f.deps.upload = async (c,p,data,signal) => {
    if (p.index === 0) return original(c,p,data,signal);
    second.resolve();
    return new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const engine = new TransferEngine(f.deps); await engine.prepare(); await second.promise; await engine.stop();
  const state = await engine.getState();
  assert.equal(state.imported, 1); assert.equal(state.failed, 0); assert.equal(state.stopped, true);
  assert.equal(state.canResume, false); assert.equal(state.canStop, false); assert.equal(state.running, false);
  assert.equal(f.disk.outcomes.length, 1); assert.ok(f.disk.pending); assert.match(await engine.report(), /one.jpg/);
  const restarted = new TransferEngine(f.deps); await restarted.start();
  assert.equal((await restarted.getState()).stopped, true); assert.equal((await restarted.getState()).imported, 1);
  assert.equal(f.exportCount, 2);
  f.deps.upload = original; await restarted.prepare(); await done(restarted);
  assert.equal((await restarted.getState()).stopped, false); assert.equal((await restarted.getState()).imported, 2);
});

test('pausar durante la lectura permite detener sin esperar a que termine la operación nativa', async () => {
  const f = fixture(); const reading = deferred<void>(); const release = deferred<void>(); let scanSignal!: AbortSignal;
  f.deps.listPhotos = async (_selected, signal) => { scanSignal = signal; reading.resolve(); await release.promise; return { ids: ['picked:one'], limited: true }; };
  const discarded: string[][] = []; f.deps.discardPhotos = async ids => { discarded.push(ids); };
  const engine = new TransferEngine(f.deps); const preparing = engine.prepare(); await reading.promise;
  assert.equal((await engine.getState()).canPause, true);
  const pausing = engine.pause(); await Promise.resolve();
  assert.equal(scanSignal.aborted, true); assert.equal((await engine.getState()).interruption, 'pause');
  assert.equal((await engine.getState()).canStop, true);
  const stopping = engine.stop(); await Promise.resolve();
  assert.equal((await engine.getState()).interruption, 'stop');
  release.resolve(); await Promise.all([preparing, pausing, stopping]);
  assert.equal(f.disk.job, null); assert.equal(f.exportCount, 0); assert.deepEqual(discarded, [['picked:one']]);
  assert.match((await engine.getState()).message, /detenida/);
});

test('pausa durante la lectura no se presenta como error ni comienza la subida', async () => {
  const f = fixture(); const reading = deferred<void>();
  f.deps.listPhotos = async (_selected, signal) => {
    reading.resolve();
    return new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('cancelled scan')), { once: true }));
  };
  const engine = new TransferEngine(f.deps); const preparing = engine.prepare(); await reading.promise;
  await engine.pause(); await preparing;
  const state = await engine.getState(); assert.equal(state.error, ''); assert.equal(state.preparing, false);
  assert.equal(f.calls.length, 0); assert.equal(state.hasJob, false); assert.match(state.message, /Lectura de fotos pausada/);
});

test('detener durante la preparación de una foto no la registra como fallida', async () => {
  const f = fixture(); const exporting = deferred<void>();
  f.deps.exportPhoto = async (_id,_index,signal) => {
    exporting.resolve();
    return new Promise((_resolve,reject) => signal.addEventListener('abort', () => reject(new Error('cancelled export')), { once: true }));
  };
  const engine = new TransferEngine(f.deps); await engine.prepare(); await exporting.promise; await engine.stop();
  const state = await engine.getState(); assert.equal(state.failed, 0); assert.equal(state.imported, 0); assert.equal(state.stopped, true);
  assert.equal(f.calls.length, 0);
});

test('una confirmación recibida al detener se guarda antes de cerrar la sesión', async () => {
  const f = fixture(); const uploading = deferred<void>(); const receipt = deferred<unknown>();
  f.deps.upload = async () => { uploading.resolve(); return receipt.promise; };
  const engine = new TransferEngine(f.deps); await engine.prepare(); await uploading.promise;
  const stopping = engine.stop(); await Promise.resolve();
  receipt.resolve({ imported: 1, duplicates: 0, rejected: [] }); await stopping;
  assert.equal((await engine.getState()).imported, 1); assert.equal((await engine.getState()).stopped, true);
  assert.equal(f.exportCount, 1); assert.equal(f.disk.pending, null); assert.equal(f.disk.outcomes.length, 1);
});

test('si falla el guardado de Detener, permanece pausada y permite volver a detener', async () => {
  const f = fixture(); f.loseReceipt(); const engine = new TransferEngine(f.deps);
  await engine.prepare(); await done(engine);
  const save = f.deps.updateJob; f.deps.updateJob = async () => { throw new Error('disk full'); };
  await assert.rejects(engine.stop(), /disk full/);
  const state = await engine.getState(); assert.equal(state.running, false); assert.equal(state.stopped, false);
  assert.equal(state.canStop, true); assert.equal(state.canResume, true); assert.match(state.error, /disk full/);
  f.deps.updateJob = save; await engine.stop(); assert.equal((await engine.getState()).stopped, true);
});

test('pausa y stop durante el guardado inicial no arrancan un trabajador al terminar', async () => {
  for (const intent of ['pause', 'stop'] as const) {
    const f = fixture(); const saving = deferred<void>(); const release = deferred<void>(); const save = f.deps.saveJob;
    f.deps.saveJob = async job => { saving.resolve(); await release.promise; await save(job); };
    const engine = new TransferEngine(f.deps); const preparing = engine.prepare(); await saving.promise;
    const interrupt = intent === 'stop' ? engine.stop() : engine.pause(); await Promise.resolve();
    release.resolve(); await Promise.all([preparing, interrupt]);
    const state = await engine.getState(); assert.equal(state.running, false); assert.equal(f.calls.length, 0);
    assert.equal(state.stopped, intent === 'stop'); assert.equal(state.canResume, intent === 'pause');
  }
});

test('abrir el selector del sistema no cancela automáticamente la selección', async () => {
  const f = fixture(); const picking = deferred<void>(); const release = deferred<void>(); let pickerSignal!: AbortSignal;
  f.deps.listPhotos = async (_selected, signal) => { pickerSignal = signal; picking.resolve(); await release.promise; return { ids: ['one'], limited: true }; };
  const engine = new TransferEngine(f.deps); const preparing = engine.prepare(true); await picking.promise;
  engine.pauseIfRunning(); await Promise.resolve();
  assert.equal(pickerSignal.aborted, false);
  release.resolve(); await preparing; await done(engine);
  assert.equal((await engine.getState()).imported, 1);
});
