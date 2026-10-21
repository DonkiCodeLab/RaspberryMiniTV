import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(path.resolve('WebApp/package.json'));
const acorn = require('acorn');
const records = [];
const messages = new Set();
const pairs = { es: {}, ca: {} };
const functions = [];
function collect(en, variants, context) {
  if (typeof en === 'string') {
    if (!en.trim()) return;
    messages.add(en);
    for (const code of ['es','ca']) if (typeof variants[code] === 'string') pairs[code][en] = variants[code];
  } else if (typeof en === 'function') functions.push({context,source:String(en)});
  else if (en && typeof en === 'object') for (const [key,value] of Object.entries(en)) collect(value, { es: variants.es?.[key], ca: variants.ca?.[key] }, context+'.'+key);
}
for (const file of fs.readdirSync('WebApp/src').filter(n => /\.[jt]sx?$/.test(n))) {
  const source = fs.readFileSync('WebApp/src/'+file,'utf8');
  const standalone = {};
  for (const match of source.matchAll(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:withLanguages\(\s*)?(?=\{)/g)) {
    let ast;
    try { ast = acorn.parseExpressionAt(source, match.index+match[0].length, {ecmaVersion:'latest'}); } catch { continue; }
    if (ast.type === 'SequenceExpression') ast = ast.expressions[0];
    const raw=source.slice(ast.start,ast.end);
    let obj;
    try { obj=vm.runInNewContext('('+raw+')', standalone); } catch {continue;}
    if (obj.es && obj.en && obj.ca && !['TMDB_LANGUAGE_BY_APP_LANGUAGE', 'names', 'aliases', 'locales'].includes(match[1])) {
      records.push({file,name:match[1],start:ast.start,end:ast.end,keys:Object.keys(obj.en).length});
      collect(obj.en,obj,file+':'+match[1]);
    } else if (['es','en','ca'].includes(match[1])) standalone[match[1]]=obj;
  }
  if (standalone.en) { records.push({file,name:'standalone',keys:Object.keys(standalone.en).length}); collect(standalone.en,standalone,file); }
}
const legacy = JSON.parse(fs.readFileSync('WebApp/src/i18n/legacy.json', 'utf8'));
for (const [es, en, ca] of legacy) collect(en, { es, ca }, 'legacy');
for (const file of fs.readdirSync('WebApp/src').filter(n => /\.[jt]sx?$/.test(n))) {
  const source = fs.readFileSync('WebApp/src/'+file, 'utf8');
  for (const match of source.matchAll(/\bmessage\(/g)) {
    try {
      let node = acorn.parseExpressionAt(source, match.index + match[0].length, { ecmaVersion: 'latest' });
      if (node.type === 'SequenceExpression') node = node.expressions[0];
      const visit = node => {
        if (node.type === 'Literal' && typeof node.value === 'string') messages.add(node.value);
        if (node.type === 'ConditionalExpression') { visit(node.consequent); visit(node.alternate); }
      };
      visit(node);
    } catch { /* Not a UI message call. */ }
  }
}
const device=JSON.parse(fs.readFileSync('DeviceApp/translations.json','utf8'));
collect(device.en,device,'device');
fs.writeFileSync('tools/i18n/catalog-sources.json',JSON.stringify({records,functions},null,2)+'\n');
fs.writeFileSync('tools/i18n/source-messages.json',JSON.stringify([...new Set([...JSON.parse(fs.readFileSync('tools/i18n/source-messages.json', 'utf8')), ...messages])],null,2)+'\n');
fs.writeFileSync('tools/i18n/existing-translations.json',JSON.stringify(pairs,null,2)+'\n');
console.log(records.map(x=>`${x.file}: ${x.name} ${x.keys}`).join('\n'));
console.log(`${messages.size} messages, ${functions.length} functions`);

