'use strict';
/**
 * Uji manual peramban: mode demo dan keadaan kosong halaman Laporan.
 * Jalankan dengan SIAGA_ORIGIN dan server hidup. Mode demo harus berlabel
 * "bukan data live", dan indeks arsip yang gagal tidak boleh meninggalkan
 * teks "Memuat..." menggantung tanpa pesan galat.
 */
const { chromium } = require('playwright');
const ORIGIN = process.env.SIAGA_ORIGIN || 'http://127.0.0.1:3000';
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  let pass = 0, fail = 0;
  const ok = (l, c, x) => { c ? (pass++, console.log('  LULUS ' + l + (x ? ' ' + x : ''))) : (fail++, console.log('  GAGAL ' + l + ' ' + (x || ''))); };
  for (const [label, url, want] of [['demo', ORIGIN + '/reports?demo=1', true], ['normal', ORIGIN + '/reports', false]]) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(url, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(7000);
    const badge = await p.locator('#reportDemoBadge').count();
    ok(label + ': label demo ' + (want ? 'ada' : 'tidak ada'), want ? badge === 1 : badge === 0, 'badge=' + badge);
    if (want && badge) ok('label menyebut bukan live', /bukan data live/.test(await p.textContent('#reportDemoBadge')));
    const content = await p.textContent('#reportContent');
    ok(label + ': isi laporan terisi', content.length > 400, 'chars=' + content.length);
    ok(label + ': tanpa galat halaman', errs.length === 0, JSON.stringify(errs.slice(0, 2)));
    await p.screenshot({ path: '/tmp/reports-' + label + '.png', fullPage: false });
    await p.close();
  }
  // Indeks arsip digagalkan: tidak boleh ada "Memuat..." menggantung.
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.route('**/reports/archive/index.json', r => r.abort());
  await p.goto(ORIGIN + '/reports', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  const status = await p.textContent('#archiveStatus');
  const body = await p.textContent('#reportContent');
  ok('indeks gagal: pesan galat jelas', /tidak dapat dimuat|12 detik/.test(status), status.slice(0, 70));
  ok('indeks gagal: tidak menggantung di Memuat', !/Memuat indeks/.test(status));
  ok('indeks gagal: arah ke Tangkap peta', /Tangkap peta/.test(body), body.slice(0, 60));
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('390px tanpa luapan mendatar', overflow <= 0, 'overflow=' + overflow);
  await p.screenshot({ path: '/tmp/reports-empty-390.png' });
  await p.close();
  await b.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' uji demo/keadaan kosong lulus.');
  process.exit(fail ? 1 : 0);
})();
