import { AppState, Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { File, Directory, Paths } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { TransferEngine } from './engine.ts';
import type { Job, Outcome, Pending } from './engine.ts';
import { ServerError } from './protocol.ts';
import { withUploadName } from './multipart.ts';
import type { Connection } from './protocol.ts';
export type { TransferState } from './engine.ts';

const connectionKey = 'minitv-go-connection-v1';
const files = new Directory(Paths.document, 'minitv-transfer');
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function database() {
  return dbPromise ??= SQLite.openDatabaseAsync('minitv-go-v1.db').then(async db => {
    await db.execAsync('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS outcomes (idx INTEGER PRIMARY KEY, value TEXT NOT NULL);');
    files.create({ intermediates: true, idempotent: true });
    return db;
  });
}
async function get<T>(key: string): Promise<T | null> {
  const row = await (await database()).getFirstAsync<{ value: string }>('SELECT value FROM state WHERE key=?', key);
  return row ? JSON.parse(row.value) : null;
}
async function put(key: string, value: unknown) {
  await (await database()).runAsync('INSERT OR REPLACE INTO state VALUES (?,?)', key, JSON.stringify(value));
}
async function request(server: string, path: string, body: string | FormData, token = '', signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 180_000);
  try {
    const response = await fetch(server + path, { method: 'POST', body, signal: controller.signal, redirect: 'error',
      headers: { ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
    const raw = await response.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { throw new ServerError(response.status, 'La MiniTV no devolvió una respuesta válida. Revisa la conexión.'); }
    if (!response.ok) throw new ServerError(response.status, typeof data.error === 'string' ? data.error : `La MiniTV respondió HTTP ${response.status}.`);
    return data;
  } catch (e) {
    if (e instanceof ServerError || signal?.aborted) throw e;
    throw new Error('No se ha podido confirmar la transferencia. Comprueba la Wi-Fi y que la MiniTV siga abierta; pulsa Continuar para reintentar.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function checkInterrupted(signal: AbortSignal) {
  if (signal.aborted) throw new Error('Transferencia interrumpida.');
}
async function selectPhotos(signal: AbortSignal) {
  checkInterrupted(signal);
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true,
    selectionLimit: 0, quality: 1, exif: false, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current });
  if (result.canceled) throw new Error('Selección cancelada. Tu importación anterior se conserva.');
  const copied: File[] = [];
  try {
    checkInterrupted(signal);
    const ids: string[] = [];
    for (const asset of result.assets) {
      checkInterrupted(signal);
      const name = asset.fileName || asset.uri.split('/').pop() || 'foto.jpg';
      const file = new File(files, 'picked-' + Crypto.randomUUID() + '-' + name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120));
      copied.push(file);
      await LegacyFileSystem.copyAsync({ from: asset.uri, to: file.uri });
      checkInterrupted(signal);
      ids.push('picked:' + JSON.stringify({ uri: file.uri, name }));
    }
    return { ids, limited: true };
  } catch (e) { for (const file of copied) if (file.exists) file.delete(); throw e; }
}
const Transfer = new TransferEngine({
  async load() {
    const db = await database();
    const secret = await SecureStore.getItemAsync(connectionKey);
    return { job: await get<Job>('job'), pending: await get<Pending>('pending'), connection: secret ? JSON.parse(secret) as Connection : null,
      outcomes: (await db.getAllAsync<{ value: string }>('SELECT value FROM outcomes ORDER BY idx')).map(row => JSON.parse(row.value) as Outcome) };
  },
  async saveConnection(c) { await SecureStore.setItemAsync(connectionKey, JSON.stringify(c)); },
  async saveJob(job) {
    const db = await database();
    await db.withTransactionAsync(async () => {
      await put('job', job); await db.runAsync('DELETE FROM outcomes'); await db.runAsync("DELETE FROM state WHERE key='pending'");
    });
    const keep = new Set(job.assetIDs.filter(id => id.startsWith('picked:')).map(id => JSON.parse(id.slice(7)).uri));
    // This directory contains only this app's staging copies, never library originals.
    try {
      for (const item of files.list()) if (item instanceof File && !keep.has(item.uri)) {
        try { item.delete(); } catch { /* Retry obsolete staging cleanup on the next import. */ }
      }
    } catch { /* The new job is already committed; cleanup must not roll it back in memory. */ }
  },
  async updateJob(job) { await put('job', job); },
  async savePending(p) { await put('pending', p); },
  async saveOutcome(o) {
    const db = await database();
    await db.withTransactionAsync(async () => {
      await db.runAsync('INSERT OR REPLACE INTO outcomes VALUES (?,?)', o.index, JSON.stringify(o));
      await db.runAsync("DELETE FROM state WHERE key='pending'");
    });
  },
  uuid: () => Crypto.randomUUID(),
  async claim(server, code) {
    let clientId = await SecureStore.getItemAsync('minitv-go-client-id');
    if (!clientId) { clientId = Crypto.randomUUID(); await SecureStore.setItemAsync('minitv-go-client-id', clientId); }
    const reply = await request(server, '/pictures/mobile/claim', JSON.stringify({ code, clientId, deviceName: Platform.OS === 'ios' ? 'iPhone · Expo Go' : 'Android · Expo Go' }));
    return { server, token: reply.token, expiresAt: reply.expiresAt };
  },
  async listPhotos(selected, signal) {
    checkInterrupted(signal);
    // Expo Go for Android does not declare broad READ_MEDIA_IMAGES access.
    if (selected || Platform.OS === 'android') return selectPhotos(signal);
    const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    checkInterrupted(signal);
    if (!permission.granted && permission.accessPrivileges !== 'limited') throw new Error('Permite el acceso a Fotos en Ajustes o usa Elegir fotos.');
    const ids: string[] = []; let after: string | undefined;
    do {
      checkInterrupted(signal);
      const page = await MediaLibrary.getAssetsAsync({ first: 200, after, mediaType: ['photo'], sortBy: [['creationTime', true]] });
      checkInterrupted(signal);
      ids.push(...page.assets.map(asset => asset.id));
      if (!page.hasNextPage) break;
      if (!page.endCursor || after === page.endCursor) throw new Error('No se pudo terminar de leer la fototeca. Vuelve a intentarlo.');
      after = page.endCursor;
      if (AppState.currentState === 'background') throw new Error('Abre Expo Go para terminar de leer la fototeca.');
    } while (true);
    return { ids, limited: permission.accessPrivileges === 'limited' };
  },
  async discardPhotos(ids) {
    for (const id of ids) if (id.startsWith('picked:')) {
      const file = new File(JSON.parse(id.slice(7)).uri);
      if (file.uri.startsWith(files.uri) && file.exists) file.delete();
    }
  },
  async exportPhoto(id, index, signal) {
    checkInterrupted(signal);
    let name: string; let file: File | undefined;
    const metadata: Record<string, unknown> = { albums: [], keywords: [], people: [] };
    try {
      if (id.startsWith('picked:')) {
        const picked = JSON.parse(id.slice(7)); name = picked.name; file = new File(picked.uri);
      } else {
        const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: true });
        checkInterrupted(signal);
        name = info.filename;
        const uri = info.localUri || info.uri;
        if (!uri || uri.startsWith('ph:')) throw new Error('No se pudo descargar esta foto de iCloud. Ábrela en Fotos y vuelve a revisarla.');
        file = new File(files, 'pending-' + Crypto.randomUUID());
        await LegacyFileSystem.copyAsync({ from: uri, to: file.uri });
        if (info.creationTime > 0) metadata.takenAt = new Date(info.creationTime).toISOString();
        if (info.location && Number.isFinite(info.location.latitude) && Number.isFinite(info.location.longitude))
          Object.assign(metadata, { locationKnown: true, latitude: info.location.latitude, longitude: info.location.longitude });
        if (Platform.OS === 'ios') Object.assign(metadata, { appleId: id, appleFavorite: info.isFavorite === true });
      }
      checkInterrupted(signal);
      if (!file.exists || !file.size) throw new Error('La foto ya no está disponible. Selecciónala de nuevo.');
      if (file.size > 50 * 1024 * 1024) throw new Error('Esta foto supera el límite de 50 MB.');
      const bytes = await file.bytes();
      checkInterrupted(signal);
      const digest = Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      checkInterrupted(signal);
      return { index, name, uri: file.uri, digest, metadata };
    } catch (e) {
      // A selected photo is the persistent source for a retry after pausing.
      if (file?.exists && !(signal.aborted && id.startsWith('picked:'))) file.delete();
      throw e;
    }
  },
  async removeFile(uri) { const file = new File(uri); if (file.exists && uri.startsWith(files.uri)) file.delete(); },
  async isMissing(c, digest, signal) {
    const reply = await request(c.server, '/pictures/import/check', JSON.stringify({ digests: [digest] }), c.token, signal);
    if (!Array.isArray(reply.missing) || !(reply.missing.length === 0 || (reply.missing.length === 1 && reply.missing[0] === 0)))
      throw new Error('La comprobación de duplicados no es válida.');
    return reply.missing.length === 1;
  },
  async upload(c, p, data, signal) {
    const metadata = new File(Paths.cache, 'minitv-metadata.json');
    metadata.write(JSON.stringify(data));
    const form = new FormData();
    form.append('metadata', withUploadName(metadata, 'metadata.json'));
    if (data.fileIndices.length) form.append('files', withUploadName(new File(p.uri), p.name));
    return request(c.server, '/pictures/upload', form, c.token, signal);
  },
  async keepAwake(active) { if (active) await activateKeepAwakeAsync('minitv-import'); else await deactivateKeepAwake('minitv-import'); },
  isActive: () => AppState.currentState === 'active',
  async writeReport(csv) { const file = new File(Paths.cache, 'MiniTV-Fotos-informe.csv'); file.write(csv); return file.uri; }
});
export default Transfer;
