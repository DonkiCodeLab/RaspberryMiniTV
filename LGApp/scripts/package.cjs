const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('./build.cjs');
fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
const result = spawnSync(process.env.ARES_PACKAGE || 'ares-package', ['--no-minify', path.join(root, 'dist'), '-o', path.join(root, 'releases')], { stdio: 'inherit' });
if (result.error) { console.error('Instala el CLI oficial de LG: npm install -g @webos-tools/cli, o indica ARES_PACKAGE=/ruta/a/ares-package.'); process.exit(1); }
process.exit(result.status === null ? 1 : result.status);
