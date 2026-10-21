// Compile the offline Raspberry catalog from the same reviewed messages as the web.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const languages = read('DeviceApp/languages.json');
const device = read('DeviceApp/translations.json');
const variables = text => [...text.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort().join('|');
for (const { id } of languages) {
  if (['en', 'es', 'ca'].includes(id)) continue;
  const catalog = read(`WebApp/src/i18n/locales/${id}.json`);
  device[id] = Object.fromEntries(Object.entries(device.en).map(([key, source]) => {
    const translated = catalog[source];
    if (!translated?.trim() || variables(source) !== variables(translated)) {
      throw new Error(`${id}: incomplete translation for ${key}: ${source}`);
    }
    return [key, translated];
  }));
}
fs.writeFileSync(path.join(root, 'DeviceApp/translations.json'), JSON.stringify(device, null, 2) + '\n');
console.log(`Compiled ${Object.keys(device.en).length} menu messages in ${languages.length} languages.`);
