'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../public/i18n.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/app.css'), 'utf8');

function count(text, needle) {
  return (text.match(new RegExp(needle, 'g')) || []).length;
}

console.log('\n== toggle, legenda, dan inspeksi PM2.5/asap ==');
assert.ok(html.includes('Raster PM2.5 total (CAMS)'));
assert.ok(html.includes('Plume indikatif (FIRMS + GFS)'));
assert.equal(count(html, 'id="lyPm25"'), 1, 'toggle PM2.5 harus unik');
assert.equal(count(html, 'id="lySmoke"'), 1, 'toggle plume harus unik');
assert.equal(count(html, 'id="pm25Status"'), 1, 'status PM2.5 harus unik');
assert.equal(count(html, 'id="pm25Legend"'), 1, 'legenda PM2.5 harus unik');
assert.match(html, /role="group" aria-label="Pilih satu mode asap"[\s\S]*?id="lyPm25"[\s\S]*?id="lySmoke"/);
assert.ok(html.includes('Hanya satu mode dapat aktif pada satu waktu.'));
assert.ok(i18n.translate('Raster PM2.5 total (CAMS)', 'en').includes('Total PM2.5 raster'));
assert.ok(i18n.translate('Plume indikatif (FIRMS + GFS)', 'en').includes('Indicative plume'));

assert.ok(app.includes("if (id === 'lySmoke' && $('lyPm25').checked) deactivatePm25Mode();"));
assert.ok(app.includes("if ($('lySmoke').checked) deactivateSmokeMode();"));
assert.ok(app.includes("if (_lp && _lp.checked && _ls && _ls.checked) _ls.checked = false;"));
assert.ok(app.includes('function deactivatePm25Mode()'));
assert.ok(app.includes('function deactivateSmokeMode()'));
assert.ok(app.includes("if (!$('lySmoke').checked) stopSmokePlayback();"));
assert.ok(app.includes('map.removeLayer(group)'));

assert.ok(app.includes('function updatePm25PointInfo(latlng, pinned)'));
assert.ok(app.includes("map.on('mousemove'"));
assert.ok(app.includes("map.on('click'"));
assert.ok(app.includes('gPm25.sampleAt(lat, lon)'));
assert.ok(app.includes('state.particles.sampleAt(lat, lon)'));
assert.ok(app.includes('Number.isFinite(value) && value >= 0'));
assert.ok(app.includes('transparent means unavailable, not zero'));
assert.ok(app.includes('Wind data is unavailable at this location.'));
assert.ok(app.includes('Math.abs(camsMs - windValidMs) > 90 * 60 * 1000'));
assert.ok(app.includes('No wind frame aligned with this CAMS time is available.'));
assert.ok(app.includes('var windSource = windFrame'));
assert.ok(app.includes('coverageNode.hidden = !smokeOn'));

assert.ok(app.includes('https://atmosphere.copernicus.eu/'));
assert.ok(app.includes('https://open-meteo.com/en/docs/air-quality-api'));
assert.ok(app.includes('PM2.5 total semua sumber; bukan khusus asap atau pengukuran stasiun.'));
assert.ok(app.includes('CAMS is total PM2.5 from all sources, not smoke-specific or a station measurement.'));
assert.ok(css.includes('.pm25-point-info'));
assert.ok(css.includes('@media(max-width:600px){.pm25-point-info'));

console.log('  LULUS label/ID unik, mode saling mengganti tetapi tetap dapat dimatikan');
console.log('  LULUS inspeksi hover/klik, sampel hilang bukan nol, dan sumber CAMS/Open-Meteo');
console.log('\n2/2 uji interaksi mode asap lulus.');
