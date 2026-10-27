export type Connection = { server: string; token: string; expiresAt: number };
export type Receipt = { imported: number; duplicates: number; rejected?: { index: number; error: string }[] };
export class ServerError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function parsePairing(text: string): { server: string; code: string } {
  let qr: URL;
  try { qr = new URL(text.trim()); } catch { throw new Error('Este QR no es un enlace de MiniTV.'); }
  const params = [...qr.searchParams.keys()];
  if (qr.protocol !== 'minitvphotos:' || qr.hostname !== 'pair' || qr.port || qr.pathname || qr.username || qr.password || qr.hash ||
      params.length !== 3 || new Set(params).size !== 3 || !['v','server','code'].every(k => params.includes(k)) || qr.searchParams.get('v') !== '1')
    throw new Error('Escanea el QR de Dashboard → Subidas → Fotos.');
  const code = qr.searchParams.get('code')!;
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('El código de enlace no es válido. Genera otro QR en la web.');
  let origin: URL;
  try { origin = new URL(qr.searchParams.get('server')!); } catch { throw new Error('Dirección de MiniTV inválida.'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash ||
      !['', '/'].includes(origin.pathname) || !origin.hostname || origin.port === '0' ||
      ['localhost','127.0.0.1','0.0.0.0','[::1]','[::]'].includes(origin.hostname.toLowerCase()))
    throw new Error('El QR debe contener la dirección de red de tu MiniTV, con su puerto.');
  return { server: origin.origin, code };
}
export function validateReceipt(value: unknown): Receipt {
  const r = value as Receipt;
  if (!r || !Number.isInteger(r.imported) || !Number.isInteger(r.duplicates) || r.imported < 0 || r.duplicates < 0 ||
      (r.rejected !== undefined && (!Array.isArray(r.rejected) || r.rejected.some(e => e.index !== 0 || typeof e.error !== 'string'))) ||
      r.imported + r.duplicates + (r.rejected?.length ?? 0) !== 1)
    throw new Error('La MiniTV no ha confirmado el resultado de esta foto. Puedes reintentar sin duplicarla.');
  return r;
}
export function manifest(session: string, index: number, digest: string, metadata: Record<string, unknown>, missing: boolean) {
  return { session, batch: `${index}-${digest}`, digests: [digest], fileIndices: missing ? [0] : [],
    records: [missing ? { metadata, raw: metadata } : { metadata: null, raw: null }], continueOnError: true, preserveAlbums: false };
}
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
