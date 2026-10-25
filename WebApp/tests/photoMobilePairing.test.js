import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { mobileServerAddress, mobilePairingURL, suggestedMobileAddress } from '../src/photoMobilePairing.js';

test('QR preserves IP, port and one-time code without a web PIN', async () => {
  const value = mobilePairingURL('http://192.168.1.50:5050/', 'a'.repeat(43));
  const url = new URL(value);
  assert.equal(url.protocol, 'minitvphotos:');
  assert.equal(url.host, 'pair');
  assert.equal(url.searchParams.get('server'), 'http://192.168.1.50:5050');
  assert.equal(url.searchParams.get('code'), 'a'.repeat(43));
  assert.equal(url.searchParams.get('v'), '1');
  assert.equal(url.searchParams.has('pin'), false);
  const image = await QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 });
  assert.match(image, /<svg/);
});

test('loopback is replaced with the server LAN address, remote addresses retain ports', () => {
  assert.equal(suggestedMobileAddress('http://localhost:5050', 'http://192.168.1.50:5050'), 'http://192.168.1.50:5050');
  assert.equal(suggestedMobileAddress('https://minitv.example:8443', 'http://192.168.1.50:5050'), 'https://minitv.example:8443');
  assert.equal(mobileServerAddress('http://[fd00::123]:5050'), 'http://[fd00::123]:5050');
});

test('reject credentials, query strings, non-HTTP URLs and loopback targets', () => {
  for (const value of ['file:///tmp/a', 'javascript:alert(1)', 'http://user:pin@192.168.1.50', 'http://localhost:5050',
    'http://127.0.0.1', 'http://[::1]', 'http://0.0.0.0', 'http://192.168.1.50/admin', 'http://192.168.1.50?pin=1234', 'http://192.168.1.50#fragment']) {
    assert.throws(() => mobileServerAddress(value), value);
  }
  assert.throws(() => mobilePairingURL('http://192.168.1.50', 'bad-code'));
});
