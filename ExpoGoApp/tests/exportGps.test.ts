import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as gps from '../src/gps.ts';
import type { Dependencies } from '../src/engine.ts';

// Run the real exporter with only native OS/file adapters replaced. This checks
// that the GPS assessment and uploaded metadata describe the same photo.
function exporter(info: Record<string, unknown> = {}, assets: Record<string, unknown>[] = []) {
  let deps!: Dependencies;
  let pickerOptions: Record<string, unknown> = {};
  class File {
    uri: string;
    exists = true;
    size = 4;
    constructor(...parts: any[]) { this.uri = parts.map(p => p.uri ?? p).join('/'); }
    async bytes() { return new Uint8Array([1, 2, 3, 4]); }
    delete() { this.exists = false; }
  }
  const adapters: Record<string, unknown> = {
    'react-native': { AppState: { currentState: 'active' }, Platform: { OS: 'ios' } },
    'expo-media-library/legacy': { getAssetInfoAsync: async () => ({ filename: 'photo.jpg', localUri: 'file:///photo.jpg', ...info }) },
    'expo-image-picker': { UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
      launchImageLibraryAsync: async (options: Record<string, unknown>) => { pickerOptions = options; return { canceled: false, assets }; } },
    'expo-crypto': { randomUUID: () => 'uuid', CryptoDigestAlgorithm: { SHA256: 'sha256' }, digest: async () => new Uint8Array(32) },
    'expo-file-system': { File, Directory: File, Paths: { document: 'file:///documents' } },
    'expo-file-system/legacy': { copyAsync: async () => {} },
    './engine.ts': { TransferEngine: class { constructor(value: Dependencies) { deps = value; } } },
    './gps.ts': gps, './protocol.ts': {}, './multipart.ts': {},
    'expo-secure-store': {}, 'expo-sqlite': {}, 'expo/fetch': {}, 'expo-keep-awake': {},
  };
  const source = ts.transpileModule(readFileSync(new URL('../src/transfer.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)((name: string) => {
    assert.ok(name in adapters, 'Unexpected native dependency: ' + name); return adapters[name];
  }, module, module.exports);
  return { deps, get pickerOptions() { return pickerOptions; } };
}

test('exportar de iPhone conserva coordenadas, clasifica su ausencia y recupera GPS EXIF', async () => {
  for (const [info, coordinates] of [
    [{ location: { latitude: 0, longitude: 0 } }, { latitude: 0, longitude: 0 }],
    [{ location: { latitude: '41.3', longitude: '2.1' } }, { latitude: 41.3, longitude: 2.1 }],
    [{ exif: { '{GPS}': { Latitude: 33, LatitudeRef: 'S', Longitude: 70, LongitudeRef: 'W' } } }, { latitude: -33, longitude: -70 }],
    [{}, null],
  ] as const) {
    const pending = await exporter(info).deps.exportPhoto('asset', 0, new AbortController().signal);
    assert.equal(pending.gps, coordinates ? 'with' : 'without');
    assert.equal(pending.metadata.locationKnown, coordinates ? true : undefined);
    assert.equal(pending.metadata.latitude, coordinates?.latitude);
    assert.equal(pending.metadata.longitude, coordinates?.longitude);
    assert.equal(pending.metadata.appleId, 'asset');
  }
});

test('la selección manual solicita GPS y lo conserva en su copia reanudable; una selección antigua queda sin dato', async () => {
  const f = exporter({}, [
    { uri: 'file:///a.jpg', fileName: 'a.jpg', exif: { GPSLatitude: 41, GPSLongitude: 2 } },
    { uri: 'file:///b.jpg', fileName: 'b.jpg', exif: {} },
    { uri: 'file:///c.jpg', fileName: 'c.jpg', exif: null },
  ]);
  const signal = new AbortController().signal;
  const { ids } = await f.deps.listPhotos(true, signal);
  assert.equal(f.pickerOptions.exif, true);
  ids.push('picked:' + JSON.stringify({ uri: 'file:///old.jpg', name: 'old.jpg' }));
  const pending = await Promise.all(ids.map((id, index) => f.deps.exportPhoto(id, index, signal)));
  assert.deepEqual(pending.map(p => p.gps), ['with', 'without', 'unknown', 'unknown']);
  assert.equal(pending[0].metadata.latitude, 41); assert.equal(pending[0].metadata.longitude, 2);
  assert.equal(pending[0].metadata.locationKnown, true);
});
