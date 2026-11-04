'use strict';
/**
 * Perekam video demo 3 menit terhadap deployment nyata.
 *
 * Kenapa ada: skrip demo tertulis saja tidak cukup untuk submit. Skrip ini
 * merekam layar apa adanya, termasuk kegagalan yang jujur, lalu segmen-segmen
 * webm digabung dan diberi narasi oleh pemanggil (lihat scripts/build-demo-video.js).
 *
 * Tidak ada data yang dipalsukan. Bila sebuah langkah gagal, kegagalannya
 * direkam dan dicatat, bukan disembunyikan atau dilewati diam-diam.
 *
 * Pakai: node scripts/record-demo.js --origin=https://firewatch-id.vercel.app
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const originArg = args.find(a => a.startsWith('--origin='));
const ORIGIN = (originArg ? originArg.slice(9) : 'https://firewatch-id.vercel.app').replace(/\/$/, '');
const onlyArg = args.find(a => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7).split(',') : null;
const OUT = path.join(__dirname, '..', 'docs', 'demo-video');
const SEG = path.join(OUT, 'segments');
fs.mkdirSync(SEG, { recursive: true });

const W = 1440;
const H = 900;
const log = [];
function note(segment, text) {
  log.push({ segment, text, at: new Date().toISOString() });
  console.log('  [' + segment + '] ' + text);
}

/** Tunggu tenang supaya peta dan ubin selesai digambar sebelum merekam. */
async function settle(page, ms) {
  await page.waitForTimeout(ms);
}

async function setEnglish(page) {
  const en = page.locator('#langEn');
  if (await en.count()) {
    await en.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

/**
 * Satu segmen = satu context Playwright dengan recordVideo.
 * Setiap segmen ditutup supaya berkas webm benar-benar tersimpan.
 */
async function segment(browser, name, fn) {
  // Lewati segmen yang tidak diminta, dan yang sudah ada supaya bisa dilanjutkan
  // setelah lingkungan sandbox di-reset tanpa merekam ulang semuanya.
  if (ONLY && !ONLY.includes(name)) return true;
  const existing = path.join(SEG, name + '.webm');
  if (!ONLY && fs.existsSync(existing)) { note(name, 'already recorded, skipping'); return true; }
  const dir = path.join(SEG, name);
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
    locale: 'en-US',
    timezoneId: 'Asia/Jakarta',
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  let ok = true;
  try {
    await fn(page);
  } catch (error) {
    ok = false;
    note(name, 'STEP FAILED (recorded honestly): ' + String(error && error.message || error).slice(0, 200));
  }
  await page.close().catch(() => {});
  const video = page.video();
  await context.close();
  if (video) {
    const file = await video.path().catch(() => null);
    if (file && fs.existsSync(file)) {
      const target = path.join(SEG, name + '.webm');
      fs.renameSync(file, target);
      note(name, 'saved ' + path.relative(process.cwd(), target) + (ok ? '' : ' (with a failed step)'));
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return ok;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  console.log('Recording against ' + ORIGIN + '\n');

  // 01 - Masalah (15s): beranda.
  await segment(browser, '01-problem', async page => {
    await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded' });
    await setEnglish(page);
    await settle(page, 6000);
    await page.mouse.wheel(0, 320);
    await settle(page, 4000);
    await page.mouse.wheel(0, -320);
    await settle(page, 5000);
    note('01-problem', 'home page shown');
  });

  // 02 - Laporan: tangkap peta, ringkasan angka, narasi AI, PDF (60s).
  await segment(browser, '02-report', async page => {
    await page.goto(ORIGIN + '/reports', { waitUntil: 'domcontentloaded' });
    await setEnglish(page);
    await settle(page, 9000);
    const btn = page.locator('#reportMapCaptureBtn');
    await btn.scrollIntoViewIfNeeded();
    await settle(page, 2500);
    await btn.click();
    note('02-report', 'clicked Capture map');
    await page.waitForSelector('#mapCaptureImg', { state: 'visible', timeout: 45000 });
    await page.waitForFunction(() => {
      const img = document.getElementById('mapCaptureImg');
      return img && img.getAttribute('src') && img.getAttribute('src').length > 5000;
    }, { timeout: 45000 });
    await settle(page, 5000);
    note('02-report', 'PNG composited with legend and timestamp');

    // Ringkasan angka dari kode, bukan dari model.
    await page.waitForFunction(() => {
      const box = document.getElementById('mapCaptureMeta');
      return box && box.textContent && box.textContent.length > 80;
    }, { timeout: 45000 }).catch(() => note('02-report', 'numeric summary slow'));
    await settle(page, 4000);

    const narrate = page.locator('#mapCaptureNarrate');
    if (await narrate.count()) {
      await narrate.click();
      note('02-report', 'requested AI narrative from image');
      await page.waitForFunction(() => {
        const box = document.getElementById('mapCaptureNarrative');
        return box && !box.hidden && box.textContent && box.textContent.length > 120
          && !/Requesting narrative|Meminta narasi/.test(box.textContent);
      }, { timeout: 90000 }).catch(() => note('02-report', 'narrative did not finish in 90s; fallback recorded'));
      await settle(page, 9000);
    }
    const toReport = page.locator('#mapCaptureToReport');
    if (await toReport.count()) {
      await toReport.click();
      note('02-report', 'added snapshot to report');
      await settle(page, 5000);
    }
    const pdf = page.getByRole('button', { name: /Export one-page PDF|Ekspor PDF satu halaman/i }).first();
    if (await pdf.count()) {
      await pdf.scrollIntoViewIfNeeded();
      await settle(page, 2000);
      const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await pdf.click();
      const got = await dl;
      if (got) {
        const target = path.join(OUT, 'demo-report.pdf');
        await got.saveAs(target);
        note('02-report', 'PDF downloaded to docs/demo-video/demo-report.pdf');
      } else {
        note('02-report', 'PDF download event not observed');
      }
      await settle(page, 4000);
    }
  });

  // 03 - Agen dengan jejak bukti (60s).
  await segment(browser, '03-agent', async page => {
    await page.goto(ORIGIN + '/dashboard', { waitUntil: 'domcontentloaded' });
    await setEnglish(page);
    await settle(page, 12000);
    await page.click('#aiFab').catch(async () => { await page.click('#globalAiFab').catch(() => {}); });
    await page.waitForSelector('#askQ', { state: 'visible', timeout: 30000 });
    await settle(page, 2000);
    const q = 'How many thermal detections are near Pekanbaru in the last 24 hours?';
    await page.fill('#askQ', q);
    await settle(page, 1500);
    await page.press('#askQ', 'Enter');
    note('03-agent', 'asked: ' + q);
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      return /NUMBER CHECK|CEK ANGKA/.test(t);
    }, { timeout: 120000 }).catch(() => note('03-agent', 'answer did not arrive in 120s; whatever appeared is recorded'));
    await settle(page, 8000);

    // Buka jejak bukti.
    const trace = page.locator('summary').filter({ hasText: /EVIDENCE TRACE|JEJAK BUKTI/i }).first();
    if (await trace.count()) {
      await trace.click().catch(() => {});
      note('03-agent', 'expanded evidence trace');
      await settle(page, 7000);
    }
    const show = page.getByRole('button', { name: /SHOW ON MAP|TAMPILKAN DI PETA/i }).first();
    if (await show.count()) {
      await show.click().catch(() => {});
      note('03-agent', 'clicked SHOW ON MAP');
      await settle(page, 7000);
    }
    // Penolakan nasihat medis.
    await page.fill('#askQ', 'I am short of breath from the smoke, what medicine should I take?');
    await page.press('#askQ', 'Enter');
    note('03-agent', 'asked a medical question to show the refusal');
    await settle(page, 22000);
  });

  // 04 - Cek Asap (30s).
  await segment(browser, '04-smoke-check', async page => {
    await page.goto(ORIGIN + '/cek-asap', { waitUntil: 'domcontentloaded' });
    await setEnglish(page);
    await settle(page, 5000);
    const fixture = path.join(__dirname, '..', 'docs', 'screenshots', 'map-capture', 'fixture-langit-uji.jpg');
    if (fs.existsSync(fixture)) {
      await page.setInputFiles('#smokePhoto', fixture);
      note('04-smoke-check', 'uploaded the test sky fixture');
      await settle(page, 4000);
    } else {
      note('04-smoke-check', 'fixture missing; using text only');
    }
    await page.fill('#smokeLat', '0.5000');
    await page.fill('#smokeLon', '101.5000');
    await page.fill('#smokeText', 'The sky over my yard looks grey and the sun is faint.');
    await settle(page, 2000);
    await page.click('#smokeSubmit');
    note('04-smoke-check', 'submitted for a verdict');
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      return /Supported|Not yet supported|Not enough data|Didukung|Belum didukung|Data tidak cukup/i.test(t);
    }, { timeout: 90000 }).catch(() => note('04-smoke-check', 'verdict slow; recorded as-is'));
    await settle(page, 8000);
    await page.mouse.wheel(0, 400);
    await settle(page, 6000);
  });

  // 05 - Penutup (15s): HACKATHON.md di GitHub.
  await segment(browser, '05-close', async page => {
    await page.goto('https://github.com/anggarabudiyantooo-hub/siaga-id/blob/main/HACKATHON.md', { waitUntil: 'domcontentloaded' });
    await settle(page, 7000);
    await page.mouse.wheel(0, 500);
    await settle(page, 4000);
    await page.mouse.wheel(0, 500);
    await settle(page, 4000);
    note('05-close', 'build log shown on GitHub');
  });

  await browser.close();
  const logPath = path.join(OUT, 'recording-log.json');
  let prior = [];
  try { prior = JSON.parse(fs.readFileSync(logPath, 'utf8')).log || []; } catch { prior = []; }
  const keep = prior.filter(entry => !log.some(x => x.segment === entry.segment));
  fs.writeFileSync(logPath, JSON.stringify({ origin: ORIGIN, recordedAt: new Date().toISOString(), log: keep.concat(log) }, null, 2) + '\n');
  console.log('\nSegments:');
  for (const f of fs.readdirSync(SEG).filter(f => f.endsWith('.webm'))) {
    console.log('  ' + f + '  ' + (fs.statSync(path.join(SEG, f)).size / 1048576).toFixed(1) + ' MB');
  }
  console.log('\nLog: docs/demo-video/recording-log.json');
})().catch(error => { console.error('FAILED', error && error.stack); process.exit(1); });
