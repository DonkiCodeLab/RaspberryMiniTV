// Vendored engines let ExpoApp build on its own (including an EAS upload).
// This script is the only place where platform integration changes the originals.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
let mismatches = [];
function sync(source, destination, transform = x => x) {
  const content = transform(fs.readFileSync(path.join(root, '..', source), 'utf8'));
  const target = path.join(root, 'modules/minitv-transfer', destination);
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) mismatches.push(destination);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content);
  }
}
for (const name of ['Pairing', 'PhotoAPI', 'PhotoExporter', 'ImportJournal', 'UploadOutbox', 'BackgroundTransfers', 'ImportModel']) {
  sync(`iOSApp/MiniTVFotos/${name}.swift`, `ios/Engine/${name}.swift`, text => text
    .replaceAll('com.donkicodelab.minitvphotos.', 'com.donkicodelab.minitvphotos.expo.')
    .replace('kSecAttrService as String: "MiniTVFotos"', 'kSecAttrService as String: "MiniTVFotosExpo"'));
}
for (const name of ['Protocol', 'PhotoAPI', 'CredentialVault', 'TransferStore', 'PhotoMedia', 'TransferEngine', 'TransferServices']) {
  sync(`AndroidApp/app/src/main/java/com/donkicodelab/minitvphotos/${name}.kt`, `android/src/main/java/com/donkicodelab/minitvphotos/engine/${name}.kt`, text => text
    .replace('Intent(context, MainActivity::class.java)', 'requireNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName))'));
}
sync('AndroidApp/app/src/main/res/drawable/ic_upload.xml', 'android/src/main/res/drawable/ic_upload.xml');
sync('AndroidApp/app/src/main/res/xml/data_extraction_rules.xml', 'android/src/main/res/xml/minitv_data_extraction_rules.xml');
for (const name of ['ProtocolTest', 'PhotoAPITest']) sync('AndroidApp/app/src/test/java/com/donkicodelab/minitvphotos/' + name + '.kt', 'android/src/test/java/com/donkicodelab/minitvphotos/' + name + '.kt');
if (mismatches.length) { console.error('Native sources out of date:', mismatches.join(', ')); process.exitCode = 1; }
else console.log(check ? 'Native engines match their sources.' : 'Native engines copied.');
