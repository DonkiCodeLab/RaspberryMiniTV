import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { gameConsoleFrame } from '../src/gameConsoleFrames.js';
import { defaultGameBindings, gameControls } from '../src/gameInputMapping.js';
import { GAME_MAPPING_STRINGS } from '../src/gameMappingStrings.js';

const require = createRequire(import.meta.url);
const t = (key, vars = {}) => Object.entries(vars).reduce((s,[key,value]) => s.replaceAll(`{${key}}`,value), GAME_MAPPING_STRINGS.es[key] || key);

test('console and television help render the saved inputs instead of the original keys', async () => {
  for (const [system, name] of [['gb','HandheldKeyboardHelp'],['megadrive','TelevisionKeyboardHelp']]) {
    const result = await build({entryPoints:[new URL(`../src/${name}.jsx`,import.meta.url).pathname], bundle:true,write:false,format:'cjs',platform:'node',external:['react']});
    const module = {exports:{}};
    new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports);
    const bindings = defaultGameBindings(system,gameControls(system));
    const input = system === 'gb' ? 8 : 1;
    bindings[input] = [{type:'mouse',button:2}];
    bindings[4] = [{type:'padAxis',pad:1,axis:3,direction:-1}];
    const html = renderToStaticMarkup(React.createElement(module.exports.default, {
      frame:gameConsoleFrame(system),systemId:system,bindings,pressedInputs:new Set([input]),annotated:true,compact:true,t,
    }));
    assert.match(html,/Ratón · Botón 3/);
    assert.match(html,/G2·E4−/);
    assert.match(html,/class="is-pressed">🖱3/);
    assert.doesNotMatch(html,/>Z<\/kbd>/);
  }
});
