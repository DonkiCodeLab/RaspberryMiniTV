import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function client() {
  const result = await build({ entryPoints: [new URL('../src/api/raspberryApi.js', import.meta.url).pathname], bundle: true, write: false,
    format: 'esm', platform: 'browser', define: { 'import.meta.env': JSON.stringify({ VITE_RASPBERRY_API_BASE_URL: 'http://raspberry:5050' }) } });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

test('EPUB bytes use authenticated fetch; PDF checks and HTTP errors remain intact', async () => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  globalThis.window = { location: { origin: 'http://localhost:5173' }, sessionStorage: { getItem: () => 'test-pin' } };
  try {
    const api = await client();
    const controller = new AbortController();
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).searchParams.get('relativePath'), 'Books/book.epub');
      assert.equal(options.headers['X-Web-Pin'], 'test-pin');
      assert.equal(options.signal, controller.signal);
      return new Response(new Uint8Array([0x50, 0x4b, 3, 4]));
    };
    assert.equal((await api.getBookContent('Books/book.epub', { format: 'epub', signal: controller.signal })).length, 4);
    globalThis.fetch = async () => new Response('<html>Not a book</html>');
    await assert.rejects(api.getBookContent('Books/book.epub', { format: 'epub' }), /EPUB válido/);
    await assert.rejects(api.getBookContent('Books/book.pdf'), /PDF válido/);
    globalThis.fetch = async () => new Response('%PDF-1.7 content');
    assert.equal((await api.getBookContent('Books/book.pdf'))[0], 37);
    for (const extension of ['cbr', 'cbz', 'CBR']) {
      globalThis.fetch = async (url, options) => {
        assert.equal(new URL(url).searchParams.get('render'), 'pdf');
        assert.equal(options.headers['X-Web-Pin'], 'test-pin');
        return new Response('%PDF-1.7 comic');
      };
      assert.equal((await api.getBookContent(`Books/comic.${extension}`))[0], 37);
      assert.equal(new URL(api.getBookContentUrl(`Books/comic.${extension}`)).searchParams.get('render'), null);
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    await assert.rejects(api.getBookContent('Books/book.epub', { format: 'epub' }), error => error.status === 401);
  } finally { Object.assign(globalThis, previous); }
});

test('a confirmed upload sends the reviewed metadata and artwork with the file', async () => {
  const previous = { window: globalThis.window, XMLHttpRequest: globalThis.XMLHttpRequest };
  globalThis.window = { location: { origin: 'http://localhost:5173' }, sessionStorage: { getItem: () => 'test-pin' } };
  const sent = [];
  globalThis.XMLHttpRequest = class {
    constructor() { this.upload = {}; }
    open(method, url) { assert.equal(method, 'POST'); assert.equal(url, 'http://raspberry:5050/books/upload'); }
    setRequestHeader(name, value) { assert.equal(name, 'X-Web-Pin'); assert.equal(value, 'test-pin'); }
    send(form) {
      sent.push(form);
      this.status = 200;
      this.responseText = JSON.stringify({ ok: true, items: [{ relativePath: 'Books/book.epub' }] });
      queueMicrotask(() => this.onload());
    }
  };
  try {
    const api = await client();
    const file = new File(['epub'], 'book.epub');
    const coverFile = new File(['image'], 'cover.png', { type: 'image/png' });
    const response = await api.uploadBookFiles({ files: [file], title: 'Reviewed title', metadata: { title: 'Reviewed title', publisher: 'Editorial', editionKey: '/books/OL2M', coverFile } });
    assert.equal(response.items[0].relativePath, 'Books/book.epub');
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0].get('metadata')), { title: 'Reviewed title', publisher: 'Editorial', editionKey: '/books/OL2M' });
    assert.equal(sent[0].get('coverFile').name, 'cover.png');
    assert.equal(sent[0].get('files').name, 'book.epub');
    for (const isGraphicNovel of [true, false]) {
      sent.length = 0;
      await api.uploadBookFiles({ files: [file, new File(['comic'], 'comic.cbz')], collection: 'Mixed',
        metadata: { isGraphicNovel, title: 'Do not copy this title to each volume', coverFile } });
      assert.equal(sent.length, 2);
      for (const form of sent) {
        assert.deepEqual(JSON.parse(form.get('metadata')), { isGraphicNovel });
        assert.equal(form.get('collection'), 'Mixed');
        assert.equal(form.get('title'), '');
        assert.equal(form.get('coverFile'), null);
      }
    }
  } finally { Object.assign(globalThis, previous); }
});
