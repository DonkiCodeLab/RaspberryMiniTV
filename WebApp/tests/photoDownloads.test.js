import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('original photo downloads keep authentication and nested names, with no preview conversion', async () => {
  const result=await build({entryPoints:[new URL('../src/api/raspberryApi.js',import.meta.url).pathname],
    bundle:true,write:false,format:'esm',platform:'browser',define:{'import.meta.env':'{}'}});
  const api=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const previous=globalThis.window;
  globalThis.window={location:{hostname:'raspberry',origin:'http://raspberry'},sessionStorage:{getItem:()=> 'fixture-pin'}};
  try {
    const original=new URL(api.getPictureContentUrl('batch/IMG ñ & 1.heic','thumb',{download:true}));
    assert.equal(original.pathname,'/pictures/content');
    assert.equal(original.searchParams.get('relativePath'),'batch/IMG ñ & 1.heic');
    assert.equal(original.searchParams.get('pin'),'fixture-pin');
    assert.equal(original.searchParams.get('download'),'1');
    assert.equal(original.searchParams.has('render'),false);
    const preview=new URL(api.getPictureContentUrl('batch/photo.heic','preview'));
    assert.equal(preview.searchParams.get('render'),'preview');assert.equal(preview.searchParams.has('download'),false);
    assert.equal(api.getPictureContentUrl('',undefined,{download:true}),'');
  } finally {globalThis.window=previous;}
});
