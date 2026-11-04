#!/usr/bin/env node
/**
 * Uji manual peramban untuk tangkapan peta, narasi, dan ekspor PDF.
 *
 * TIDAK ikut `npm run check` karena butuh Playwright, Chromium, dan
 * jaringan nyata (petak Esri + data publik). Jalankan sendiri:
 *
 *   node server.js                 # terminal lain, port 3000
 *   node scripts/manual-map-capture.js
 *
 * Hasil gambar dan PDF ditulis ke docs/screenshots/map-capture/ supaya
 * bisa diperiksa mata, bukan hanya dinyatakan lulus oleh skrip.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ORIGIN = process.env.SIAGA_ORIGIN || 'http://127.0.0.1:3000';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots', 'map-capture');
let pass = 0;
let fail = 0;

function ok(name, condition, detail) {
  if (condition) { pass += 1; console.log('  LULUS', name, detail || ''); }
  else { fail += 1; console.error('  GAGAL', name, detail || ''); }
}

async function waitStatus(page, selector) {
  await page.waitForFunction((sel) => {
    const node = document.querySelector(sel);
    return node && node.dataset.kind && node.dataset.kind !== 'info';
  }, selector, { timeout: 45000 });
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    return { kind: node.dataset.kind, text: node.textContent };
  }, selector);
}

async function dashboard(browser) {
  console.log('\n== dashboard: tangkap peta desktop dan mobile ==');
  for (const vp of [{ width: 1440, height: 900, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(ORIGIN + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.SiagaMapContext === 'function' && typeof window.MapScreenshot === 'object', null, { timeout: 45000 });
    await page.waitForTimeout(10000);
    await page.click('#mapCaptureBtn');
    const status = await waitStatus(page, '#mapCaptureStatus');
    ok(vp.tag + ': tangkapan berhasil', status.kind === 'ok', status.text.slice(0, 70));
    // Ringkasan angka dihitung server setelah tangkapan selesai; tunggu
    // kedatangannya, jangan menilai sebelum permintaan itu kembali.
    await page.waitForFunction(() => document.querySelectorAll('#mapCaptureMeta dt').length >= 8, null, { timeout: 45000 })
      .catch(() => { /* dinilai oleh assertions di bawah */ });
    const shot = await page.evaluate(() => {
      const img = document.getElementById('mapCaptureImg');
      return { src: img.src || '', rows: document.querySelectorAll('#mapCaptureMeta dt').length };
    });
    ok(vp.tag + ': PNG cukup besar', shot.src.length > 20000, 'chars=' + shot.src.length);
    ok(vp.tag + ': ringkasan angka terisi', shot.rows >= 6, 'rows=' + shot.rows);
    if (shot.src.length > 2000) {
      fs.writeFileSync(path.join(OUT, 'dashboard-' + vp.tag + '.png'), Buffer.from(shot.src.split(',')[1], 'base64'));
    }
    await page.screenshot({ path: path.join(OUT, 'dialog-' + vp.tag + '.png') });
    ok(vp.tag + ': tanpa galat halaman', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    await page.close();
  }
}

async function reports(browser) {
  console.log('\n== laporan: peta kecil, dua frame, ekspor PDF ==');
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(ORIGIN + '/reports', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.SiagaMapContext === 'function' && typeof window.ReportPdf === 'object', null, { timeout: 45000 });
  await page.waitForTimeout(10000);
  ok('peta laporan memuat petak', (await page.evaluate(() => document.querySelectorAll('#reportMap img.leaflet-tile').length)) > 0);

  for (const win of ['24', '6']) {
    await page.selectOption('#rmWindow', win);
    await page.waitForTimeout(1500);
    await page.click('#reportMapCaptureBtn');
    const status = await waitStatus(page, '#mapCaptureStatus');
    ok('tangkapan jendela ' + win + ' jam berhasil', status.kind === 'ok');
    await page.click('#mapCaptureToReport');
    await page.waitForTimeout(2500);
  }
  const stored = await page.evaluate(() => {
    const payload = JSON.parse(sessionStorage.getItem('siaga.mapCapture.v2') || 'null');
    return {
      frames: payload ? payload.frames.length : 0,
      withSummary: payload ? payload.frames.filter((f) => !!f.structured).length : 0
    };
  });
  ok('dua frame tersimpan', stored.frames === 2, JSON.stringify(stored));
  ok('kedua frame punya ringkasan angka', stored.withSummary === 2);
  ok('label sebelum dan sesudah muncul',
    (await page.evaluate(() => Array.from(document.querySelectorAll('.report-capture-frame-label')).map((n) => n.textContent).join(','))) === 'Sebelum,Sesudah');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    page.click('#reportCaptureBody .site-button.primary')
  ]);
  const target = path.join(OUT, 'report-two-frame.pdf');
  await download.saveAs(target);
  const bytes = fs.readFileSync(target);
  ok('PDF terunduh', bytes.length > 10000, 'bytes=' + bytes.length);
  ok('PDF satu halaman', (bytes.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length === 1);
  ok('PDF memuat dua gambar', (bytes.toString('latin1').match(/\/Subtype \/Image/g) || []).length === 2);
  await page.screenshot({ path: path.join(OUT, 'reports-desktop.png'), fullPage: false });
  ok('tanpa galat halaman', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(ORIGIN + '/reports', { waitUntil: 'domcontentloaded' });
  await mobile.waitForTimeout(9000);
  await mobile.evaluate(() => { const node = document.getElementById('tangkapan-peta'); if (node) node.scrollIntoView(); });
  await mobile.waitForTimeout(600);
  const overflow = await mobile.evaluate(() => document.body.scrollWidth - window.innerWidth);
  ok('mobile: tidak ada luapan mendatar', overflow <= 0, 'overflow=' + overflow);
  await mobile.screenshot({ path: path.join(OUT, 'reports-mobile.png') });
  await mobile.close();
}

async function failureModes(browser) {
  console.log('\n== kegagalan dilaporkan jujur ==');
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(ORIGIN + '/reports', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  // Narasi dipaksa gagal lewat jaringan yang diblokir, bukan lewat kode
  // produksi: yang diuji adalah pesan di layar.
  await page.route('**/api/map-narrative', (route) => route.abort());
  await page.click('#reportMapCaptureBtn');
  await waitStatus(page, '#mapCaptureStatus');
  await page.click('#mapCaptureNarrate');
  await page.waitForFunction(() => {
    const box = document.getElementById('mapCaptureNarrative');
    return box && /gagal|failed/i.test(box.textContent);
  }, null, { timeout: 30000 });
  const message = await page.textContent('#mapCaptureNarrative');
  ok('kegagalan narasi dijelaskan, bukan gambar kosong', /gagal|failed/i.test(message), message.slice(0, 80));
  await page.screenshot({ path: path.join(OUT, 'narasi-gagal.png') });
  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    await dashboard(browser);
    await reports(browser);
    await failureModes(browser);
  } finally {
    await browser.close();
  }
  console.log(`\n${pass}/${pass + fail} uji manual peramban lulus. Hasil: docs/screenshots/map-capture/\n`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error('GAGAL', error && error.message); process.exit(1); });
