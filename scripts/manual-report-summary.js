'use strict';
/**
 * Uji manual peramban: kartu ringkasan di atas laporan.
 * Angka harus dibaca dari arsip, AQI/PM2.5 harus dinyatakan tidak disimpan
 * (bukan nol), metode harus dilipat, dan ID/EN harus setara.
 */
const { chromium } = require('playwright');
const ORIGIN = process.env.SIAGA_ORIGIN || 'http://127.0.0.1:3000';
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  let pass = 0, fail = 0;
  const ok = (l, c, x) => { c ? (pass++, console.log('  LULUS ' + l + (x ? ' ' + x : ''))) : (fail++, console.log('  GAGAL ' + l + ' ' + (x || ''))); };
  for (const [label, vp] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    const errs = []; p.on('pageerror', e => errs.push(String(e)));
    await p.goto(ORIGIN + '/reports', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(8000);
    ok(label + ': kartu ringkasan ada', await p.locator('.report-summary').count() === 1);
    const tiles = await p.locator('.report-sum-tile').count();
    ok(label + ': enam petak ringkasan', tiles === 6, 'tiles=' + tiles);
    const narr = await p.textContent('.report-sum-narrative');
    ok(label + ': narasi berisi angka dari arsip', /\d/.test(narr) && narr.length > 80, 'chars=' + narr.length);
    ok(label + ': AQI dinyatakan tidak disimpan, bukan nol', /tidak disimpan di arsip/.test(await p.textContent('.report-summary')));
    const det = p.locator('.report-sum-method');
    ok(label + ': metode dilipat (accordion)', await det.count() === 1 && !(await det.evaluate(n => n.open)));
    await det.locator('summary').click();
    ok(label + ': metode bisa dibuka', await det.evaluate(n => n.open));
    await det.locator('summary').click();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(label + ': tanpa luapan mendatar', overflow <= 0, 'overflow=' + overflow);
    ok(label + ': tanpa galat halaman', errs.length === 0, JSON.stringify(errs.slice(0, 2)));
    // Fokus keyboard pada accordion
    await p.locator('.report-sum-method summary').focus();
    ok(label + ': accordion bisa difokus keyboard', await p.evaluate(() => document.activeElement.tagName.toLowerCase() === 'summary'));
    await p.screenshot({ path: require('path').join(__dirname, '..', 'docs', 'screenshots', 'map-capture', 'summary-' + label + '.png') });
    await p.close();
  }
  // Paritas EN
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(ORIGIN + '/reports', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(8000);
  await p.click('#langEn');
  await p.waitForTimeout(4000);
  const en = await p.textContent('.report-summary');
  ok('EN: judul kartu berbahasa Inggris', /This issue at a glance/.test(en));
  ok('EN: petak berbahasa Inggris', /Hotspot detections/.test(en) && /Source status/.test(en));
  ok('EN: AQI dinyatakan tidak disimpan', /not stored in the archive/.test(en));
  await p.screenshot({ path: require('path').join(__dirname, '..', 'docs', 'screenshots', 'map-capture', 'summary-en.png') });
  await p.close();
  await b.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' uji kartu ringkasan lulus.');
  process.exit(fail ? 1 : 0);
})();
