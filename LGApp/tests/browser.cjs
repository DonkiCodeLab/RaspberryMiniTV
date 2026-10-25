const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const appURL = pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;
const output = path.resolve(__dirname, '../../output');
fs.mkdirSync(output, {recursive: true});

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({viewport: {width: 1920, height: 1080}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const reset = await page.request.post('http://127.0.0.1:5059/fixture/reset', {headers: {'X-Web-Pin': '9999'}});
    assert.equal(reset.status(), 200);
    await page.goto(appURL);
    await page.screenshot({path: path.join(output, 'minitv-lg-connect.png')});
    await page.getByRole('button', {name: 'Explorar una demostración'}).click();
    await page.getByRole('heading', {name: 'Los Simpson', exact: true}).waitFor();
    await page.mouse.move(0, 0);
    await page.locator('[data-focus="hero"]').focus();
    await page.screenshot({path: path.join(output, 'minitv-lg-home.png')});
    await page.keyboard.press('ArrowDown');
    assert.match(await page.evaluate(() => document.activeElement.dataset.focus || ''), /card-/);
    await page.keyboard.press('Enter');
    await page.getByRole('heading', {name: 'Sin blanca Navidad', exact: true}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Explorar la serie'}).click();
    await page.getByRole('button', {name: 'Temporada 1', exact: true}).waitFor();
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 461, bubbles: true})));
    await page.getByRole('button', {name: 'Explorar la serie'}).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Salir');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await page.getByRole('button', {name: 'Ajustes', exact: true}).click();
    await page.getByRole('button', {name: 'Cambiar de MiniTV / cerrar sesión'}).click();

    // The packaged file origin really performs preflight against the fixture,
    // using the production tv_access module. No CORS bypass or browser flags.
    await page.getByLabel('Dirección de la MiniTV', {exact: true}).fill('http://127.0.0.1:5059');
    await page.getByLabel('PIN', {exact: true}).fill('0000');
    await page.getByRole('button', {name: 'Conectar con mi MiniTV'}).click();
    await page.getByRole('alert').filter({hasText: 'PIN no es válido'}).waitFor();
    await page.getByLabel('PIN', {exact: true}).fill('9999');
    await page.getByRole('button', {name: 'Conectar con mi MiniTV'}).click();
    await page.getByRole('button', {name: 'C Casa', exact: true}).click();
    await page.getByRole('heading', {name: 'Serie de prueba', exact: true}).waitFor();
    assert.equal(await page.evaluate(() => Object.values(localStorage).some(v => v.includes('9999'))), false);

    await page.getByRole('button', {name: 'Películas', exact: true}).click();
    await page.locator('[data-focus="card-Movies/hello.mp4"]').click();
    await page.getByRole('button', {name: 'Añadir a mi lista'}).click();
    await page.getByRole('button', {name: 'Quitar de mi lista'}).waitFor();
    await page.getByRole('button', {name: 'Reproducir', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('video')?.currentTime > 0);
    await page.evaluate(() => document.querySelector('video').currentTime = 6);
    await page.getByRole('button', {name: 'Subtítulos: no', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('video').textTracks.length > 0 && document.querySelector('video').textTracks[0].mode === 'showing');
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 19, bubbles: true})));
    assert.equal(await page.evaluate(() => document.querySelector('video').paused), true);
    await page.keyboard.press('Escape');
    await page.getByRole('heading', {name: 'Película de prueba', exact: true}).waitFor();
    const state = await page.evaluate(async () => (await fetch('http://127.0.0.1:5059/users/default/state', {headers: {'X-Web-Pin': '9999'}})).json());
    assert.ok(state.progress['["video","Movies/hello.mp4"]'].seconds >= 6);
    assert.equal(state.marks['["movie","Movies/hello.mp4"]'].favorite, true);

    await page.getByRole('button', {name: 'Fotos', exact: true}).click();
    await page.getByRole('button', {name: 'Ver presentación'}).click();
    await page.waitForFunction(() => document.querySelector('.full-photo')?.naturalWidth > 0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: 'Buscar', exact: true}).click();
    await page.getByRole('searchbox').fill('prueba');
    await page.locator('.search-form button').click();
    assert.equal(await page.locator('.media-card').count(), 4);

    await page.getByRole('button', {name: 'Ajustes', exact: true}).click();
    await page.getByRole('button', {name: 'Cambiar de MiniTV / cerrar sesión'}).click();
    await page.reload();
    assert.equal(await page.getByLabel('PIN', {exact: true}).inputValue(), '');
    assert.equal(await page.getByLabel('Dirección de la MiniTV', {exact: true}).inputValue(), 'http://127.0.0.1:5059');
    assert.deepEqual(errors, []);
    console.log('PASS: demo, D-pad, LG Back, exit focus, real file-origin CORS, invalid PIN, profile, favorites, video, subtitles, media keys, progress, photos, search and credential lifetime.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
