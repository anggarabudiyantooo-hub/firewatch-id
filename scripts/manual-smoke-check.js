#!/usr/bin/env node
/**
 * Uji manual peramban untuk halaman Cek Asap. Tidak ikut `npm run check`
 * karena butuh Playwright, Chromium, dan server yang berjalan.
 *
 *   node server.js
 *   node scripts/manual-smoke-check.js
 *
 * Tanpa MODEL_API_KEY di server, putusan yang benar adalah "data tidak
 * cukup" dengan penjelasan bahwa foto tidak dinilai. Uji ini menuntut
 * kejujuran itu, bukan menuntut model selalu tersedia.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ORIGIN = process.env.SIAGA_ORIGIN || 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'map-capture');
const FIXTURE = path.join(OUT, 'fixture-langit-uji.jpg');
let pass = 0;
let fail = 0;
function ok(name, condition, detail) {
  if (condition) { pass += 1; console.log('  LULUS', name, detail || ''); }
  else { fail += 1; console.error('  GAGAL', name, detail || ''); }
}

/** Gambar uji dibuat di peramban supaya tidak perlu berkas biner di repo. */
async function makeFixture(browser) {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 600);
    grad.addColorStop(0, '#9aa0a6');
    grad.addColorStop(1, '#c2bcae');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 900, 600);
    ctx.fillStyle = '#d8ccb0';
    ctx.beginPath();
    ctx.arc(670, 140, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#464a42';
    ctx.fillRect(0, 470, 900, 130);
    return canvas.toDataURL('image/jpeg', 0.88);
  });
  await page.close();
  fs.writeFileSync(FIXTURE, Buffer.from(dataUrl.split(',')[1], 'base64'));
  return FIXTURE;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const fixture = await makeFixture(browser);
  for (const vp of [{ width: 1280, height: 1000, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
    console.log('\n== Cek Asap ' + vp.tag + ' ==');
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(ORIGIN + '/cek-asap', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    ok('halaman terbuka', await page.isVisible('#smokeForm'));
    ok('waktu terisi otomatis', (await page.inputValue('#smokeTime')).length > 10);

    await page.setInputFiles('#smokePhoto', fixture);
    await page.waitForFunction(() => {
      const wrap = document.getElementById('smokePreviewWrap');
      return wrap && !wrap.hidden;
    }, null, { timeout: 20000 });
    const info = await page.textContent('#smokePreviewInfo');
    ok('foto dikodekan ulang dan EXIF dibuang', /EXIF/.test(info), info);
    ok('ukuran diperkecil bila perlu', /JPEG/.test(info));

    await page.fill('#smokeLat', '-0.5000');
    await page.fill('#smokeLon', '101.5000');
    await page.fill('#smokeText', 'Langit di halaman rumah tampak kelabu dan matahari samar.');
    await page.click('#smokeSubmit');
    await page.waitForFunction(() => {
      const section = document.getElementById('smokeResultSection');
      return section && !section.hidden;
    }, null, { timeout: 90000 });
    const state = await page.evaluate(() => ({
      verdict: (document.querySelector('.smoke-verdict-label') || {}).textContent || '',
      note: (document.querySelector('.smoke-verdict-note') || {}).textContent || '',
      rows: document.querySelectorAll('.smoke-evidence dt').length,
      limits: document.querySelectorAll('.smoke-limits li').length,
      disclaimer: (document.querySelector('.smoke-disclaimer') || {}).textContent || '',
      retention: (document.querySelector('.smoke-retention') || {}).textContent || '',
      warning: (document.querySelector('.smoke-warning') || {}).textContent || ''
    }));
    ok('putusan tampil', state.verdict.length > 3, state.verdict);
    ok('putusan dinyatakan dihitung kode', /dihitung kode|computed by code/.test(state.note));
    ok('bukti publik tampil', state.rows >= 4, String(state.rows));
    ok('keterbatasan tampil', state.limits >= 3, String(state.limits));
    ok('disclaimer bukan laporan resmi', /bukan laporan resmi|not an official report/i.test(state.disclaimer));
    ok('retensi foto dinyatakan', /tidak disimpan|not stored/.test(state.retention));
    const status = await page.evaluate(() => {
      const node = document.getElementById('smokeStatus');
      return { kind: node.dataset.kind, text: node.textContent };
    });
    ok('pemeriksaan selesai tanpa galat klien', status.kind === 'ok', status.text);
    const configured = await page.evaluate(async () => {
      const response = await fetch('/api/ask/status');
      const body = await response.json();
      return !!body.metaApiConfigured;
    });
    if (!configured) {
      ok('tanpa kunci: jujur menyebut foto tidak dinilai',
        /tidak dinilai|not assessed/.test(state.warning) && /Data tidak cukup|Not enough data/.test(state.verdict), state.warning.slice(0, 80));
    } else {
      ok('dengan kunci: provider Muse Spark atau fallback berlabel', true, state.verdict);
    }
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    ok('tidak ada luapan mendatar', overflow <= 0, 'overflow=' + overflow);
    await page.screenshot({ path: path.join(OUT, 'cek-asap-' + vp.tag + '.png'), fullPage: vp.tag === 'mobile' });
    ok('tanpa galat halaman', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    await page.close();
  }

  console.log('\n== kegagalan jaringan dilaporkan ==');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN + '/cek-asap', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.route('**/api/cek-asap', (route) => route.abort());
  await page.fill('#smokeLat', '-6.2');
  await page.fill('#smokeLon', '106.82');
  await page.fill('#smokeText', 'Langit kelabu.');
  await page.click('#smokeSubmit');
  await page.waitForFunction(() => {
    const node = document.getElementById('smokeStatus');
    return node && node.dataset.kind === 'error';
  }, null, { timeout: 30000 });
  ok('jaringan gagal dijelaskan, bukan diam', /Tidak dapat menghubungi server|Could not reach/.test(await page.textContent('#smokeStatus')));
  await page.screenshot({ path: path.join(OUT, 'cek-asap-gagal.png') });
  await page.close();

  await browser.close();
  console.log(`\n${pass}/${pass + fail} uji manual Cek Asap lulus.\n`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error('GAGAL', error && error.message); process.exit(1); });
