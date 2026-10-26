'use strict';

const geometry = require('../public/smoke-geometry');
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  if (actual === expected) {
    passed++;
    console.log('  LULUS ' + name);
  } else {
    failed++;
    console.log('  GAGAL ' + name + ': dapat ' + JSON.stringify(actual) + ', harap ' + JSON.stringify(expected));
  }
}

const square = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]];
const concave = [[0, 0], [0, 10], [4, 10], [4, 4], [10, 4], [10, 0], [0, 0]];

console.log('\n== geometri seleksi asap ==');
check('titik di dalam poligon tertutup', geometry.containsPoint(square, 5, 5), true);
check('titik di luar poligon', geometry.containsPoint(square, 12, 5), false);
check('titik tepat pada sisi horizontal masuk', geometry.containsPoint(square, 0, 5), true);
check('titik tepat pada sisi vertikal masuk', geometry.containsPoint(square, 5, 0), true);
check('titik tepat pada sudut masuk', geometry.containsPoint(square, 10, 10), true);
check('poligon tanpa titik penutup diterima', geometry.containsPoint(square.slice(0, -1), 5, 5), true);
check('bagian lebar bentuk konkaf masuk', geometry.containsPoint(concave, 2, 8), true);
check('bagian tegak bentuk konkaf masuk', geometry.containsPoint(concave, 8, 2), true);
check('lekukan konkaf tidak salah dianggap masuk', geometry.containsPoint(concave, 8, 8), false);
check('poligon kosong ditolak', geometry.containsPoint([], 0, 0), false);
check('poligon dengan titik rusak ditolak', geometry.containsPoint([[0, 0], [0, 2], ['bukan angka', 2]], 0.5, 0.5), false);
check('koordinat masukan tidak valid ditolak', geometry.containsPoint(square, 'bukan angka', 4), false);

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/app.css'), 'utf8');
const smokeCloud = fs.readFileSync(path.join(root, 'public/smoke-cloud-layer.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/v3-ui.js'), 'utf8');
check('modul geometri dimuat sebelum app.js',
  html.indexOf('<script src="/smoke-geometry.js">') >= 0 &&
  html.indexOf('<script src="/smoke-geometry.js">') < html.indexOf('<script src="/app.js">'), true);
check('app.js memakai fungsi geometri bersama',
  app.indexOf('window.SiagaSmokeGeometry') >= 0 && app.indexOf('geometry.containsPoint(polygon, lat, lon)') >= 0, true);
check('versi aset server meliputi modul geometri', server.indexOf("'smoke-geometry.js'") >= 0, true);
check('pane wilayah mengikuti subtab yang dipilih',
  ui.indexOf('const id=bs[i].dataset.sub;') > ui.indexOf('bs.forEach((x,j)=>{'), true);
check('play dan jeda prakiraan asap tersedia di linimasa bawah',
  html.indexOf('<div class="dock-panel on" id="d-linimasa"') >= 0
    && html.indexOf('id="smokePlay"') > html.indexOf('<div class="dock-panel on" id="d-linimasa"')
    && (html.match(/id="smokePlay"/g) || []).length === 1
    && app.includes('function startSmokePlayback()') && app.includes('function stopSmokePlayback()'), true);
check('penggeser linimasa mencakup 24 jam historis hingga +18 jam',
  /id="tlSel" class="smoke-play-range" type="range" min="-24" max="18" step="6"/.test(html)
    && html.includes('24-18') && html.includes('18-12') && html.includes('12-6')
    && html.includes('6-0') && html.includes('+6') && html.includes('+12') && html.includes('+18'), true);
check('frame plume historis menggunakan data arsip yang tersedia saja',
  app.includes('plumeHistoryFrame(h)') && app.includes('historyFrame.plumes')
    && app.includes("historyFrame.status === 'wind-unavailable'")
    && app.includes("historyFrame.status === 'partial'")
    && server.includes('fetchWindFieldAt') && server.includes('historyWindows(hotspots, anchorTime)'), true);
check('titik api historis difilter ke interval akuisisi frame',
  app.includes('Date.parse(frame.intervalStart)') && app.includes('Date.parse(frame.intervalEnd)'), true);
const drawPm25At = app.indexOf('function drawPm25()');
const pm25NegativeGuardAt = app.indexOf('Number(state.plumeHour) < 0', drawPm25At);
check('CAMS PM2.5 historis tidak ditampilkan sebagai plume atau nilai buatan',
  app.includes('Data PM2.5 historis CAMS tidak tersedia sebelum frame 0.')
    && drawPm25At >= 0 && pm25NegativeGuardAt > drawPm25At
    && pm25NegativeGuardAt < app.indexOf('var forecast = state.air.pm25Forecast', drawPm25At), true);
check('playback berhenti hanya saat seluruh layer prakiraan mati',
  /if \(id === 'lySmoke' && !\$\('lyPm25'\)\.checked\) stopSmokePlayback\(\)/.test(app)
    && app.includes("if (!$('lySmoke').checked) stopSmokePlayback();"), true);
check('geser manual menjeda playback sebelum mengubah frame',
  app.includes("_tlSel.addEventListener('input'")
    && /stopSmokePlayback\(\);\s*setSmokeHour\(event\.target\.value\)/.test(app), true);
check('keterangan waktu membedakan plume dari ukuran PM2.5',
  /bukan ukuran PM2\.5/i.test(html) && /bukan ukuran PM2\.5/i.test(app)
    && app.includes('PM2.5 total model CAMS Global'), true);
check('modul raster kabut dimuat setelah Leaflet dan sebelum app.js',
  html.indexOf('<script src="/smoke-cloud-layer.js">') > html.indexOf('<script src="/vendor/leaflet.js">')
    && html.indexOf('<script src="/smoke-cloud-layer.js">') < html.indexOf('<script src="/app.js">'), true);
check('renderer kabut masuk daftar versi aset server', server.includes("'smoke-cloud-layer.js'"), true);
check('drawSmoke memakai kanvas gabungan dan poligon transparan untuk interaksi',
  app.includes('SiagaSmokeCloudLayer.create') && app.includes("className: 'smoke-hit-area'")
    && !app.includes('middlePolygon') && !app.includes("className: 'smoke-core'")
    && !app.includes("className: 'smoke-plume-outline'"), true);
check('renderer menggabungkan plume dan melembutkan badan serta tepinya',
  smokeCloud.includes('drawMask(maskContext, this._map, coords, size, this._plumes, PADDING)')
    && smokeCloud.includes("filter = 'blur(' + BROAD_BLUR + 'px)'")
    && smokeCloud.includes("filter = 'blur(' + BODY_BLUR + 'px)'")
    && css.includes('.leaflet-container .smoke-cloud-tile{pointer-events:none}'), true);
check('renderer tidak mengubah layer PM2.5 dan gaya tetap diberi batas interpretasi',
  !app.includes('smoke-haze') && !app.includes('smoke-body') && !app.includes('smoke-core')
    && app.includes('Rona gelap hanya gaya visual') && app.includes('Rona gelap bukan ukuran konsentrasi.'), true);

console.log('\n' + '='.repeat(40));
console.log('  ' + passed + ' lulus, ' + failed + ' gagal');
console.log('='.repeat(40));
process.exit(failed ? 1 : 0);
