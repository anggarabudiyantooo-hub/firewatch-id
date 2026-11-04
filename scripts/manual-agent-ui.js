#!/usr/bin/env node
/**
 * Uji manual peramban untuk panel asisten: lencana cek angka, jejak bukti,
 * dan tombol "Tampilkan di peta". Tidak ikut `npm run check` karena butuh
 * Playwright, Chromium, dan server yang berjalan.
 *
 *   node server.js
 *   node scripts/manual-agent-ui.js
 *
 * Tanpa MODEL_API_KEY, server menjawab dengan mode lokal. Uji ini tetap
 * menuntut lencana muncul dan menyatakan bahwa angka dihitung kode, bukan
 * model: itulah perilaku jujur yang harus terlihat saat kuota Meta habis.
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of [{ width: 1440, height: 900, tag: 'desktop' }, { width: 390, height: 844, tag: 'mobile' }]) {
    console.log('\n== panel asisten ' + vp.tag + ' ==');
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(ORIGIN + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(10000);
    await page.click('#aiFab').catch(() => {});
    await page.waitForTimeout(1200);
    ok('panel asisten bisa dibuka', await page.isVisible('#askQ'));
    await page.fill('#askQ', 'situasi karhutla hari ini');
    await page.press('#askQ', 'Enter');
    await page.waitForFunction(() => {
      const box = document.getElementById('askOut');
      return box && box.textContent.length > 60;
    }, null, { timeout: 60000 });
    const state = await page.evaluate(() => {
      const badge = document.querySelector('.ask-verify-label');
      const hints = document.querySelectorAll('.ask-map-hint-btn');
      return {
        badge: badge ? badge.textContent : null,
        hints: hints.length,
        text: (document.getElementById('askOut') || {}).textContent || ''
      };
    });
    ok('lencana cek angka muncul', !!state.badge, state.badge || '');
    ok('mode jujur saat model tidak dipakai',
      /dihitung kode|computed by code|cocok dengan hasil alat|matched a tool result/.test(state.badge || ''), state.badge || '');
    ok('jawaban menyebut angka dari data', /\d/.test(state.text));
    if (state.hints) {
      await page.click('.ask-map-hint-btn');
      await page.waitForTimeout(1200);
      ok('tombol peta bisa ditekan tanpa galat', true, state.hints + ' tombol');
    } else {
      console.log('  INFO tidak ada petunjuk peta pada jawaban ini (alat koordinat tidak dipanggil)');
    }
    await page.screenshot({ path: path.join(OUT, 'agent-' + vp.tag + '.png') });
    ok('tanpa galat halaman', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    await page.close();
  }
  await browser.close();
  console.log(`\n${pass}/${pass + fail} uji manual panel asisten lulus.\n`);
  process.exit(fail ? 1 : 0);
})().catch((error) => { console.error('GAGAL', error && error.message); process.exit(1); });
