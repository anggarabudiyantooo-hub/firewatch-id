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

console.log('\n== toggle, legenda, dan inspeksi raster CAMS/plume ==');
assert.ok(html.includes('Raster PM2.5 total (CAMS)'));
assert.ok(html.includes('Kedalaman optik aerosol (AOD)'));
assert.ok(html.includes('Debu model dekat permukaan'));
assert.ok(html.includes('Plume indikatif (FIRMS + GFS)'));
['lyPm25', 'lyAod', 'lyDust', 'lySmoke'].forEach(function (id) {
  assert.equal(count(html, 'id="' + id + '"'), 1, 'toggle ' + id + ' harus unik');
});
assert.match(html, /id="lyPm25" checked/);
assert.equal(count(html, 'id="pm25Status"'), 1, 'status raster harus unik');
assert.equal(count(html, 'id="pm25Legend"'), 1, 'legenda raster harus unik');
assert.match(html, /role="group" aria-label="Pilih satu layer model CAMS atau plume indikatif"[\s\S]*?id="lyPm25"[\s\S]*?id="lyAod"[\s\S]*?id="lyDust"[\s\S]*?id="lySmoke"/);
assert.ok(html.includes('PM2.5 adalah total model, bukan konsentrasi asap spesifik.'));
assert.ok(i18n.translate('Raster PM2.5 total (CAMS) · utama', 'en').includes('primary'));
assert.ok(i18n.translate('Kedalaman optik aerosol (AOD)', 'en').includes('Aerosol optical depth'));
assert.ok(i18n.translate('Debu model dekat permukaan', 'en').includes('near-surface dust'));
assert.ok(i18n.translate('Animasi partikel angin', 'en').includes('Wind particle animation'));

assert.ok(app.includes("if (id === 'lySmoke' && modelRasterIsOn()) deactivateModelRasterMode();"));
assert.ok(app.includes("if ($('lySmoke').checked) deactivateSmokeMode();"));
assert.ok(app.includes("var _modeIds = ['lyPm25', 'lyAod', 'lyDust', 'lySmoke'];"));
assert.ok(app.includes('function deactivateModelRasterMode()'));
assert.ok(app.includes('function deactivateOtherModelRasters(activeKind)'));
assert.ok(app.includes('function deactivateSmokeMode()'));
assert.ok(app.includes('function bindModelRasterToggle(id, kind)'));
assert.ok(app.includes('syncSmokeBasemap();'));
assert.ok(app.includes("if (!modelRasterIsOn()) stopSmokePlayback();"));
assert.ok(app.includes('map.removeLayer(group)'));

assert.ok(app.includes('function updatePm25PointInfo(latlng, pinned)'));
assert.ok(app.includes("map.on('mousemove'"));
assert.ok(app.includes("map.on('click'"));
assert.ok(app.includes('meta.layer.sampleAt(lat, lon)'));
assert.ok(app.includes('state.particles.sampleAt(lat, lon)'));
assert.ok(app.includes('Number.isFinite(value) && value >= 0'));
assert.ok(app.includes('transparent means unavailable, not zero'));
assert.ok(app.includes('Wind data is unavailable at this location.'));
assert.ok(app.includes('Math.abs(camsMs - windValidMs) > 90 * 60 * 1000'));
assert.ok(app.includes('No aligned wind frame is available for this CAMS time; particles are paused.'));
assert.ok(app.includes('var windSource = windFrame'));
assert.ok(app.includes('coverageNode.hidden = !smokeOn'));
assert.ok(app.includes('Aerosol optical depth'));
assert.ok(app.includes('whole-atmosphere'));
assert.ok(app.includes('fire-smoke measurement'));

assert.ok(app.includes('https://atmosphere.copernicus.eu/'));
assert.ok(app.includes('https://open-meteo.com/en/docs/air-quality-api'));
assert.ok(app.includes('PM2.5 CAMS adalah total semua sumber, bukan khusus asap atau pengukuran stasiun.'));
assert.ok(app.includes('CAMS Global total PM2.5 near the surface, from all sources'));
assert.ok(css.includes('.pm25-point-info'));
assert.ok(css.includes('@media(max-width:600px){.pm25-point-info'));

console.log('  LULUS PM2.5/AOD/debu/plume eksklusif, PM2.5 default, dan basemap gelap');
console.log('  LULUS inspeksi hover/klik, interpolasi nilai, caveat dan atribusi terpisah');
console.log('\n2/2 uji interaksi mode raster lulus.');
