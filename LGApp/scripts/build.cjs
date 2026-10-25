const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const info = JSON.parse(fs.readFileSync(path.join(root, 'src/appinfo.json'), 'utf8'));
for (const file of [info.main, info.icon, info.largeIcon, 'assets/welcome.mp4']) {
  if (!fs.existsSync(path.join(root, 'src', file))) throw new Error(`Missing application asset: ${file}`);
}
// Only our own build directory is replaced. Nothing in WebApp/dist is touched.
fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'src'), path.join(root, 'dist'), { recursive: true });
console.log(`MiniTV LG ${info.version}: dist/ ready (static ES5, no runtime dependencies).`);
