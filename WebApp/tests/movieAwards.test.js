import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({entryPoints:[new URL('../src/awardCatalog.js', import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const { movieAwards } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

test('a film winning several awards shows every distinct symbol', () => {
  assert.deepEqual(movieAwards(496243).map(item => item.award), ['oscars','palme']);
  assert.deepEqual(movieAwards('1064213').map(item => item.award), ['oscars','palme']);
});

test('Goya co-winners each receive a badge and unrelated movies receive none', () => {
  for (const id of [1174481,1215185]) assert.deepEqual(movieAwards(id).map(item => item.award), ['goya']);
  for (const id of [undefined, null, '', 0, 999999999, 'Movies/Anora.mp4']) assert.deepEqual(movieAwards(id), []);
});

test('badge labels identify award, winning category and ceremony year in the selected language', () => {
  assert.match(movieAwards(496243,'es')[0].label,/Óscar.*MEJOR PELÍCULA.*2020/);
  assert.match(movieAwards(496243,'ca')[0].label,/MILLOR PEL·LÍCULA/);
  assert.match(movieAwards(496243,'en')[0].label,/BEST PICTURE/);
  assert.match(movieAwards(496243)[1].label,/PALME D’OR.*2019/);
});
