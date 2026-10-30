import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { withUploadName } from '../src/multipart.ts';

// Exercise the installed Expo serializer, not Node's browser-compatible FormData:
// Node honors append's filename argument and would hide this native regression.
function expoModule(url: URL): any {
  const source = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(
    (path: string) => expoModule(new URL(path + '.ts', url)), module, module.exports);
  return module.exports;
}
const { installFormDataPatch } = expoModule(new URL('../node_modules/expo/src/winter/FormData.ts', import.meta.url));
const { convertFormDataAsync } = expoModule(new URL('../node_modules/expo/src/winter/fetch/convertFormData.ts', import.meta.url));
const NativeFormData: typeof FormData = installFormDataPatch(class { _parts: unknown[] = []; });

function stagedFile(uri: string, bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])) {
  // Filesystem Files have an inherited name getter and are not instanceof Blob.
  const file = Object.create({ get name() { return uri.split('/').pop(); } });
  return Object.assign(file, { uri, type: '', bytes: async () => bytes }) as Blob & { uri: string; name: string };
}
async function transmittedFile(form: FormData, field = 'files') {
  const { body, boundary } = await convertFormDataAsync(form);
  const parsed = await new Response(body, { headers: { 'content-type': 'multipart/form-data; boundary=' + boundary } }).formData();
  return (parsed as unknown as { get(name: string): File }).get(field);
}

test('native multipart preserves the original extension for old pending files and selected photos', async () => {
  for (const [uri, name] of [
    ['file:///minitv-transfer/pending-9051aafb-2246-424d-b8c8-5869f5f7a50b', 'IMG_0746.HEIC'],
    ['file:///minitv-transfer/picked-uuid-IMG_0001.JPG', 'IMG_0001.JPG'],
    ['file:///minitv-transfer/pending-uuid', 'screenshot.png'],
  ]) {
    const original = stagedFile(uri);
    const legacy = new NativeFormData(); legacy.append('files', original, name);
    assert.notEqual((await transmittedFile(legacy)).name, name, 'reproduces the old native filename mismatch');
    const corrected = new NativeFormData(); corrected.append('files', withUploadName(original, name));
    const uploaded = await transmittedFile(corrected);
    assert.equal(uploaded.name, name);
    assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), await original.bytes());
    assert.equal(original.uri, uri, 'preserves the pending file for resumable receipts');
  }
});

test('multipart names cannot inject headers or paths and metadata keeps its JSON filename', async () => {
  const form = new NativeFormData();
  form.append('files', withUploadName(stagedFile('file:///pending-uuid'), '../bad\\name\r\n".jpg'));
  assert.equal((await transmittedFile(form)).name, '.._bad_name___.jpg');
  const metadata = new NativeFormData();
  metadata.append('metadata', withUploadName(stagedFile('file:///cache/minitv-metadata.json'), 'metadata.json'));
  assert.equal((await transmittedFile(metadata, 'metadata')).name, 'metadata.json');
});
