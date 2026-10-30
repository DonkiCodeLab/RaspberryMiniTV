import { manifest, parsePairing, ServerError, validateReceipt, csvCell } from './protocol.ts';
import type { Connection } from './protocol.ts';
export type Job = { id: string; server: string; assetIDs: string[]; limited: boolean; stopped?: boolean };
export type Outcome = { index: number; assetID: string; name: string; state: 'new' | 'existing' | 'failed'; detail: string };
export type Pending = { index: number; name: string; uri: string; digest: string; metadata: Record<string, unknown> };
export type TransferState = {
  connected: boolean; server: string; running: boolean; preparing: boolean; limited: boolean;
  hasJob: boolean; canResume: boolean; message: string; error: string; total: number;
  imported: number; existing: number; failed: number; percentage: number; fileName: string;
  fileProgress: number; recent: string[]; backgroundNotice: string;
  canPause: boolean; canStop: boolean; stopped: boolean; interruption: 'pause' | 'stop' | null;
};
export interface Dependencies {
  load(): Promise<{ job: Job | null; outcomes: Outcome[]; pending: Pending | null; connection: Connection | null }>;
  saveConnection(c: Connection): Promise<void>;
  saveJob(job: Job): Promise<void>;
  updateJob(job: Job): Promise<void>;
  savePending(p: Pending): Promise<void>;
  saveOutcome(o: Outcome): Promise<void>;
  uuid(): string;
  claim(server: string, code: string): Promise<Connection>;
  listPhotos(selected: boolean, signal: AbortSignal): Promise<{ ids: string[]; limited: boolean }>;
  discardPhotos(ids: string[]): Promise<void>;
  exportPhoto(id: string, index: number, signal: AbortSignal): Promise<Pending>;
  removeFile(uri: string): Promise<void>;
  isMissing(c: Connection, digest: string, signal: AbortSignal): Promise<boolean>;
  upload(c: Connection, p: Pending, data: ReturnType<typeof manifest>, signal: AbortSignal): Promise<unknown>;
  keepAwake(active: boolean): Promise<void>;
  isActive(): boolean;
  writeReport(csv: string): Promise<string>;
}
const label = (state: Outcome['state']) => ({ new: 'Nueva', existing: 'Ya estaba', failed: 'Fallida' })[state];
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export class TransferEngine {
  private deps: Dependencies;
  private loaded: Promise<void> | null = null;
  private job: Job | null = null;
  private connection: Connection | null = null;
  private outcomes = new Map<number, Outcome>();
  private pending: Pending | null = null;
  private worker: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private preparation: Promise<void> | null = null;
  private interruptTask: Promise<void> | null = null;
  private interruption: 'pause' | 'stop' | null = null;
  private stopping = false;
  private preparing = false;
  private connecting = false;
  private message = 'Enlaza tu MiniTV para empezar.';
  private error = '';
  private fileName = '';
  constructor(deps: Dependencies) { this.deps = deps; }
  private init() {
    return this.loaded ??= this.deps.load().then(data => {
      this.job = data.job; this.connection = data.connection; this.pending = data.pending;
      this.outcomes = new Map(data.outcomes.map(o => [o.index, o]));
      if (this.job) this.message = this.job.stopped ? 'Exportación detenida. Las fotos confirmadas y el informe se conservan.' : this.outcomes.size < this.job.assetIDs.length ? 'Progreso guardado. Pulsa Continuar subida.' : 'Importación terminada. Puedes consultar el informe.';
      else if (this.connection) this.message = 'Lista para revisar tus fotos.';
    });
  }
  async getState(): Promise<TransferState> {
    await this.init();
    const counts = { imported: 0, existing: 0, failed: 0 };
    for (const o of this.outcomes.values()) counts[o.state === 'new' ? 'imported' : o.state === 'existing' ? 'existing' : 'failed']++;
    const total = this.job?.assetIDs.length ?? 0;
    return { connected: !!this.connection && this.connection.expiresAt * 1000 > Date.now(), server: this.connection?.server ?? '',
      running: !!this.worker, preparing: this.preparing || this.connecting, limited: this.job?.limited ?? false,
      hasJob: !!this.job, canResume: !!this.job && !this.job.stopped && !this.worker && !this.preparing && !this.interruptTask && this.outcomes.size < total, message: this.message, error: this.error,
      canPause: (!!this.worker || this.preparing) && !this.interruption,
      canStop: (!!this.worker || this.preparing || (!!this.job && !this.job.stopped && this.outcomes.size < total)) && this.interruption !== 'stop',
      stopped: this.job?.stopped === true, interruption: this.interruption,
      total, ...counts, percentage: total ? this.outcomes.size / total : 0, fileName: this.fileName, fileProgress: -1,
      recent: [...this.outcomes.values()].slice(-12).reverse().map(o => `${label(o.state)} · ${o.name}${o.detail ? ' · ' + o.detail : ''}`),
      backgroundNotice: 'Mantén Expo Go abierto durante toda la importación. La pantalla permanecerá encendida. Si sales, la subida se pausa; vuelve y pulsa Continuar. El progreso se guarda en este móvil.' };
  }
  async previewPairing(qr: string) { return parsePairing(qr).server; }
  async connect(qr: string) {
    await this.init();
    if (this.worker || this.preparing || this.connecting || this.interruptTask) throw new Error('Pausa la importación antes de enlazar.');
    this.connecting = true;
    try {
      const { server, code } = parsePairing(qr);
      if (this.job && !this.job.stopped && this.job.server !== server && this.outcomes.size < this.job.assetIDs.length)
        throw new Error('Hay una importación pendiente para otra dirección. Enlaza la misma MiniTV para continuarla.');
      const c = await this.deps.claim(server, code);
      if (!/^[A-Za-z0-9_-]{43}$/.test(c.token) || !Number.isFinite(c.expiresAt) || c.expiresAt * 1000 <= Date.now() || c.server !== server)
        throw new Error('La MiniTV ha devuelto un enlace inválido.');
      await this.deps.saveConnection(c); this.connection = c; this.error = '';
      this.message = 'MiniTV enlazada. Puedes subir tus fotos.';
    } finally { this.connecting = false; }
  }
  private requireConnection(): Connection {
    if (!this.connection || this.connection.expiresAt * 1000 <= Date.now()) throw new Error('El enlace ha caducado. Escanea un nuevo QR de la misma MiniTV para continuar.');
    if (this.job && !this.job.stopped && this.job.server !== this.connection.server && this.outcomes.size < this.job.assetIDs.length)
      throw new Error('La importación pertenece a otra MiniTV.');
    return this.connection;
  }
  async prepare(selected = false) {
    await this.init();
    if (this.worker || this.preparing || this.connecting || this.interruptTask) return;
    const c = this.requireConnection();
    this.preparing = true; this.stopping = false; this.error = ''; this.message = 'Leyendo las fotos autorizadas…';
    this.controller = new AbortController();
    this.preparation = this.preparePhotos(c, selected, this.controller.signal).finally(async () => {
      await this.deps.keepAwake(false).catch(() => {});
      this.preparing = false; this.preparation = null; this.controller = null;
    });
    await this.preparation;
    if (!this.stopping) await this.start();
  }
  private async preparePhotos(c: Connection, selected: boolean, signal: AbortSignal) {
    let selection: { ids: string[]; limited: boolean } | null = null;
    let committed = false;
    try {
      await this.deps.keepAwake(true);
      if (!this.active()) return;
      selection = await this.deps.listPhotos(selected, signal);
      const { ids, limited } = selection;
      if (!this.active()) { this.message = 'Lectura de fotos pausada. Vuelve a revisar la fototeca para empezar.'; return; }
      const job = { id: this.deps.uuid(), server: c.server, assetIDs: [...new Set(ids)], limited };
      await this.deps.saveJob(job);
      committed = true;
      const previous = this.pending;
      this.job = job; this.pending = null; this.outcomes.clear();
      if (previous) await this.deps.removeFile(previous.uri).catch(() => {});
      this.message = job.assetIDs.length ? 'Fototeca preparada.' : 'No hay fotos autorizadas. Revisa el permiso de Fotos en Ajustes.';
    } catch (e) {
      if (!signal.aborted) throw e;
    } finally {
      if (selection && !committed) await this.deps.discardPhotos(selection.ids).catch(() => {});
    }
  }
  async start() {
    await this.init();
    if (this.worker || this.preparing || this.connecting || this.interruptTask || !this.job || this.job.stopped || this.outcomes.size >= this.job.assetIDs.length) return;
    const c = this.requireConnection();
    if (!this.deps.isActive()) throw new Error('Abre Expo Go para continuar la importación.');
    this.stopping = false; this.error = '';
    this.controller = new AbortController();
    this.worker = this.run(c, this.controller.signal).catch(e => {
      if (!this.stopping) {
        this.error = errorText(e);
        if (e instanceof ServerError && e.status === 401 && this.connection) this.connection.expiresAt = 0;
        this.message = 'Subida pausada. El progreso está guardado; puedes reintentar.';
      }
    }).finally(async () => {
      await this.deps.keepAwake(false).catch(() => {});
      this.worker = null; this.controller = null; this.fileName = '';
    });
  }
  // The system photo picker can background Expo Go while preparing a selection.
  // Only an active upload should be paused automatically by AppState.
  pauseIfRunning() { if (this.worker) void this.pause().catch(() => {}); }
  async pause() {
    await this.init();
    return this.interrupt('pause');
  }
  async stop() {
    await this.init();
    return this.interrupt('stop');
  }
  private interrupt(intent: 'pause' | 'stop') {
    if (intent === 'stop' || !this.interruption) this.interruption = intent;
    this.stopping = true; this.controller?.abort(); this.error = '';
    this.message = this.interruption === 'stop' ? 'Deteniendo y guardando el resumen…' : 'Pausando y guardando el progreso…';
    const wasPreparing = this.preparing;
    return this.interruptTask ??= Promise.all([this.worker, this.preparation]).then(async () => {
      if (this.interruption === 'stop') {
        if (this.job) {
          const stopped = { ...this.job, stopped: true };
          // Update only the session: never clear its confirmed outcomes or pending receipt.
          await this.deps.updateJob(stopped); this.job = stopped;
        }
        this.message = 'Exportación detenida. Las fotos confirmadas y el informe se conservan.';
      } else if (wasPreparing) this.message = 'Lectura de fotos pausada. Vuelve a revisar la fototeca para empezar.';
      else if (this.job && this.outcomes.size < this.job.assetIDs.length) this.message = 'Subida pausada. Pulsa Continuar para retomarla.';
    }).catch(e => {
      this.error = errorText(e); this.message = 'La subida está pausada, pero no se pudo guardar la detención. Vuelve a pulsar Detener.';
      throw e;
    }).finally(() => { this.interruptTask = null; this.interruption = null; });
  }
  private active() { return !this.stopping && this.deps.isActive(); }
  private async run(c: Connection, signal: AbortSignal) {
    await this.deps.keepAwake(true);
    const job = this.job!;
    for (let index = 0; index < job.assetIDs.length; index++) {
      if (!this.active()) break;
      if (this.outcomes.has(index)) continue;
      const assetID = job.assetIDs[index];
      this.message = `Comprobando foto ${index + 1} de ${job.assetIDs.length}…`;
      if (!this.pending) {
        let p: Pending;
        try { p = await this.deps.exportPhoto(assetID, index, signal); }
        catch (e) {
          if (!this.active()) break;
          const outcome: Outcome = { index, assetID, name: assetID, state: 'failed', detail: errorText(e) };
          await this.deps.saveOutcome(outcome); this.outcomes.set(index, outcome); continue;
        }
        // Persist the exact bytes and digest before any request. Retrying an uncertain
        // receipt always uses the same server batch, even if the photo later changes.
        await this.deps.savePending(p); this.pending = p;
      }
      if (this.pending.index !== index) throw new Error('El progreso guardado no corresponde a esta foto.');
      if (!this.active()) break;
      const p = this.pending; this.fileName = p.name;
      const missing = await this.deps.isMissing(c, p.digest, signal);
      if (!this.active()) break;
      this.message = missing ? 'Enviando original…' : 'Confirmando foto existente…';
      const receipt = validateReceipt(await this.deps.upload(c, p, manifest(job.id, index, p.digest, p.metadata, missing), signal));
      const outcome: Outcome = { index, assetID, name: p.name,
        state: receipt.imported ? 'new' : receipt.duplicates ? 'existing' : 'failed', detail: receipt.rejected?.[0]?.error ?? '' };
      // Saving outcome and deleting pending are one transaction. Network errors never
      // turn an unconfirmed upload into a completed/failed photo.
      await this.deps.saveOutcome(outcome); this.outcomes.set(index, outcome); this.pending = null;
      await this.deps.removeFile(p.uri).catch(() => {});
    }
    this.message = this.outcomes.size === job.assetIDs.length ? 'Importación terminada. Consulta las nuevas, existentes y fallidas.' : 'Subida pausada. Pulsa Continuar para retomarla.';
  }
  async report() {
    await this.init();
    const rows = [...this.outcomes.values()].sort((a,b) => a.index - b.index).map(o => [o.name,label(o.state),o.detail,o.assetID].map(csvCell).join(','));
    return this.deps.writeReport('\uFEFFFoto,Resultado,Detalle,Identificador\r\n' + rows.join('\r\n'));
  }
}
