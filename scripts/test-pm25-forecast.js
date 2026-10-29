'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const forecast = require('../lib/pm25-forecast');

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('  LULUS ' + name);
  } catch (error) {
    failed++;
    console.log('  GAGAL ' + name + ': ' + error.message);
  }
}

function location(lat, lon, values, options) {
  const opts = options || {};
  const start = Date.parse('2026-10-19T10:00:00Z');
  const times = Array.from({ length: 19 }, (_, i) => new Date(start + i * 3600000).toISOString().slice(0, 16));
  return {
    latitude: lat,
    longitude: lon,
    hourly_units: { pm2_5: opts.unit || 'μg/m³' },
    hourly: {
      time: opts.times || times,
      pm2_5: values || Array.from({ length: 19 }, (_, i) => i)
    }
  };
}

const baseValues = Array.from({ length: 19 }, (_, i) => i + 0.25);
baseValues[0] = 0;
baseValues[6] = 12.6;
baseValues[12] = 25.2;
baseValues[18] = 38.4;

check('frame CAMS diambil pada 0, +6, +12, dan +18 jam', () => {
  const out = forecast.fromOpenMeteo(location(-7.5, 110.8, baseValues), 1.5, '2026-10-19T10:25:00Z');
  assert.deepEqual(out.hours, [0, 6, 12, 18]);
  assert.deepEqual(out.points[0].values, [0, 12.6, 25.2, 38.4]);
});

check('waktu berlaku dinormalisasi sebagai ISO UTC dan melewati pergantian hari', () => {
  const out = forecast.fromOpenMeteo(location(-7.5, 110.8, baseValues), 1.5, '2026-10-19T10:25:00Z');
  assert.deepEqual(out.validTimes, [
    '2026-10-19T10:00:00.000Z', '2026-10-19T16:00:00.000Z',
    '2026-10-19T22:00:00.000Z', '2026-10-20T04:00:00.000Z'
  ]);
});

check('satuan, model, ketinggian, grid, dan waktu ambil sumber disebut', () => {
  const out = forecast.fromOpenMeteo(location(-7.5, 110.8, baseValues), 0.5, '2026-10-19T10:25:00Z');
  assert.equal(out.model, 'CAMS Global');
  assert.equal(out.source, 'Open-Meteo Air Quality API');
  assert.equal(out.units, 'µg/m³');
  assert.equal(out.surfaceHeightM, 10);
  assert.equal(out.nativeResolutionDeg, 0.4);
  assert.equal(out.nativeIntervalHours, 3);
  assert.equal(out.sampleStepDeg, 0.5);
  assert.equal(out.fetchedAt, '2026-10-19T10:25:00.000Z');
  const withoutRetrievalTime = forecast.fromOpenMeteo(location(-7.5, 110.8, baseValues), 0.5);
  assert.equal(withoutRetrievalTime.fetchedAt, null);
});

check('nilai nol sah, sedangkan null, negatif, dan NaN bukan nol', () => {
  const values = baseValues.slice();
  values[6] = null;
  values[12] = -1;
  values[18] = NaN;
  const out = forecast.fromOpenMeteo(location(-7.5, 110.8, values), 1.5, '2026-10-19T10:25:00Z');
  assert.equal(out.available, true);
  assert.deepEqual(out.points[0].values, [0, null, null, null]);
});

check('koordinat hilang atau di luar rentang dan nilai negatif tidak digambar', () => {
  const bad = location(999, 110.8, baseValues);
  const missing = location(-7.5, 110.8, baseValues);
  missing.latitude = null;
  const empty = location(-7.5, 110.8, Array(19).fill(-1));
  const out = forecast.fromOpenMeteo([bad, missing, empty], 1.5, '2026-10-19T10:25:00Z');
  assert.equal(out.available, false);
  assert.equal(out.count, 0);
  assert.deepEqual(out.points, []);
});

check('titik model yang berulang dideduplikasi berdasarkan koordinat grid', () => {
  const first = location(-7.50001, 110.80001, baseValues);
  const duplicate = location(-7.50002, 110.80002, baseValues.map(value => value + 5));
  const out = forecast.fromOpenMeteo([first, duplicate], 0.25, '2026-10-19T10:25:00Z');
  assert.equal(out.count, 1);
  assert.deepEqual(out.points[0].values, [0, 12.6, 25.2, 38.4]);
});

check('titik dengan waktu berbeda tidak dicampur pada satu frame', () => {
  const shifted = location(-6.5, 107.5, baseValues);
  shifted.hourly.time[6] = '2026-10-19T17:00';
  const out = forecast.fromOpenMeteo([location(-7.5, 110.8, baseValues), shifted], 1, '2026-10-19T10:25:00Z');
  assert.equal(out.count, 1);
  assert.equal(out.points[0].lat, -7.5);
});

check('waktu frame harus berjarak enam jam dan tanggal kalender harus sah', () => {
  const changed = location(-7.5, 110.8, baseValues);
  changed.hourly.time[12] = '2026-10-19T23:00';
  assert.equal(forecast.fromOpenMeteo(changed, 1.5, '2026-10-19T10:25:00Z'), null);
  const invalidCalendar = location(-7.5, 110.8, baseValues);
  invalidCalendar.hourly.time[0] = '2026-02-31T10:00';
  assert.equal(forecast.fromOpenMeteo(invalidCalendar, 1.5, '2026-10-19T10:25:00Z'), null);
});

check('respons tanpa 19 jam, unit dikenal, atau nilai PM2.5 ditolak sebagai prakiraan', () => {
  const short = location(-7.5, 110.8, baseValues);
  short.hourly.time = short.hourly.time.slice(0, 18);
  short.hourly.pm2_5 = short.hourly.pm2_5.slice(0, 18);
  const wrongUnit = location(-7.5, 110.8, baseValues, { unit: 'ppm' });
  assert.equal(forecast.fromOpenMeteo(short, 1.5, '2026-10-19T10:25:00Z'), null);
  assert.equal(forecast.fromOpenMeteo(wrongUnit, 1.5, '2026-10-19T10:25:00Z'), null);
});

check('step tampilan harus berasal dari daftar yang diizinkan', () => {
  assert.equal(forecast.fromOpenMeteo(location(-7.5, 110.8, baseValues), 0.3, '2026-10-19T10:25:00Z'), null);
});

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

check('endpoint meminta CAMS Global, empat frame, dan waktu UTC dalam satu permintaan bulk', () => {
  assert.ok(server.includes('CONFIG.UPSTREAM_URLS.openMeteo.airQuality'));
  assert.ok(server.includes('&hourly=pm2_5&forecast_hours=19&timezone=UTC&domains=cams_global'));
  assert.ok(server.includes('pm25Forecast.fromOpenMeteo(arr, step'));
  assert.ok(server.includes('pm25Forecast: forecast'));
  assert.ok(server.includes("req.query.forecast === '1'"));
  assert.ok(server.includes("req.query.aqi !== '0'"));
  assert.ok(server.includes('const withAqi = includeAqi !== false'));
  assert.ok(server.includes("const cachePrefix = withAqi ? (withForecast ? 'aqf' : 'aq') : 'pmf'"));
  assert.ok(server.includes("withAqi ? '&current=pm2_5,pm10,us_aqi' : ''"));
  assert.ok(server.includes('if (!withAqi) return { step, count: 0, points, pm25Forecast: forecast };'));
  assert.ok(server.includes('legend: includeAqi ? AQI_BANDS.map'));
});

check('layer PM2.5 memakai raster grid, pane tersendiri, dan mengikuti linimasa', () => {
  assert.ok(app.includes("map.createPane('pm25Pane')"));
  assert.ok(app.includes('window.SiagaSmokeGridLayer.create(L'));
  assert.ok(app.includes('function drawPm25('));
  assert.ok(app.includes('gPm25.setFrame(points, index)'));
  assert.ok(app.includes('if (state.pm25On) drawPm25()'));
  assert.ok(app.includes('Waktu berlaku PM2.5: '));
  assert.ok(app.includes('Waktu berlaku PM2.5 tidak tersedia.'));
  assert.ok(app.includes('function ensureForecastLayers('));
});

check('query memilih route grid PM2.5 beserta level angin dan tetap memisahkan AQI', () => {
  assert.ok(app.includes("var q = 'step=' + step + '&aqi=' + (state.airOn ? '1' : '0')"));
  assert.ok(app.includes("if (useSmokeGrid) q += '&level=' + encodeURIComponent(resolveWindLevel())"));
  assert.ok(app.includes("else q += '&forecast=0'"));
  assert.ok(app.includes("(useSmokeGrid ? '/api/smoke-grid?' : '/api/air-quality?') + q"));
  assert.ok(app.includes("if (state.airOn) drawAir()"));
  assert.ok(app.includes("var _lyAir = $('lyAir')"));
});

check('layer PM2.5 mengikuti move/zoom dan keadaan checkbox awal', () => {
  assert.ok(app.includes('if (state.airOn || state.pm25On) loadAir();'));
  assert.ok(app.includes("['lyFire', gFire], ['lyAir', gAir], ['lyPm25', gPm25]"));
  assert.ok(app.includes('if (state.pm25On) loadAir();'));
});

check('request udara hanya diulang untuk area terbaru yang berbeda', () => {
  assert.ok(app.includes('var pendingQ = state.airPendingQ;'));
  assert.ok(app.includes('pendingQ !== q && (state.airOn || state.pm25On)'));
});

check('antarmuka menyebut PM2.5 total dan bukan atribusi asap', () => {
  assert.ok(html.includes('id="lyPm25"'));
  assert.ok(html.includes('PM2.5 total model (CAMS)'));
  assert.ok(html.includes('bukan kontribusi khusus asap'));
  assert.ok(html.includes('id="pm25Status"'));
  assert.ok(html.includes('id="pm25Legend"'));
});

check('modul raster PM2.5 dimuat setelah Leaflet dan ikut versi cache aset', () => {
  assert.ok(html.indexOf('<script src="/smoke-grid-layer.js">') > html.indexOf('<script src="/vendor/leaflet.js">'));
  assert.ok(html.indexOf('<script src="/smoke-grid-layer.js">') < html.indexOf('<script src="/app.js">'));
  assert.ok(server.includes("'smoke-grid-layer.js'"));
  assert.ok(app.includes("var PM25_COLOR_GRADIENT = 'linear-gradient"));
});

console.log('\n' + '='.repeat(42));
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('='.repeat(42));
if (failed) process.exitCode = 1;
