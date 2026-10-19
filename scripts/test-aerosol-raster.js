'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const raster = require('../lib/aerosol-raster');

let passed = 0;
function test(name, run) {
  run();
  passed++;
  console.log('  OK   ' + name);
}

const sample = '<Capabilities><Contents><Layer>'
  + '<ows:Identifier>' + raster.LAYER_ID + '</ows:Identifier>'
  + '<Dimension><ows:Identifier>Time</ows:Identifier><Default>2026-10-19</Default>'
  + '<Value>2026-10-18/2026-10-19/P1D</Value></Dimension>'
  + '</Layer></Contents></Capabilities>';

console.log('\nUji proksi raster aerosol NASA');
test('tanggal default diambil dari layer yang diizinkan', () => {
  assert.strictEqual(raster.parseLatestDate(sample), '2026-10-19');
});
test('tidak memakai tanggal dari layer lain', () => {
  assert.throws(() => raster.parseLatestDate(sample.replace(raster.LAYER_ID, 'OTHER_LAYER')));
});
test('dimension waktu yang hilang ditolak', () => {
  const xml = sample.replace(/<Dimension>[\s\S]*?<\/Dimension>/, '');
  assert.throws(() => raster.parseLatestDate(xml));
});
test('tanggal kalender tidak valid ditolak', () => {
  assert.throws(() => raster.parseLatestDate(sample.replace('2026-10-19', '2026-02-30')));
});
test('tanggal tile harus berupa tanggal kalender ISO', () => {
  assert.strictEqual(raster.isValidDate('2026-10-19'), true);
  assert.strictEqual(raster.isValidDate('2026-2-9'), false);
  assert.strictEqual(raster.isValidDate('2026-02-30'), false);
});
test('tanggal terkini dan jendela tujuh hari diterima, tanggal masa depan atau usang ditolak', () => {
  const now = Date.parse('2026-10-19T12:00:00Z');
  assert.strictEqual(raster.isRecentDate('2026-10-19', now), true);
  assert.strictEqual(raster.isRecentDate('2026-10-12', now), true);
  assert.strictEqual(raster.isRecentDate('2026-10-11', now), false);
  assert.strictEqual(raster.isRecentDate('2026-10-20', now), false);
});
test('indeks petak dibatasi hingga GoogleMapsCompatible level 6', () => {
  assert.strictEqual(raster.isValidTile(0, 0, 0), true);
  assert.strictEqual(raster.isValidTile(6, 63, 63), true);
  assert.strictEqual(raster.isValidTile(6, 64, 63), false);
  assert.strictEqual(raster.isValidTile(6, 63, -1), false);
  assert.strictEqual(raster.isValidTile(7, 0, 0), false);
  assert.strictEqual(raster.isValidTile(5, 1.5, 1), false);
});
test('URL GIBS tetap pada host, layer, proyeksi, tanggal, dan urutan baris-kolom', () => {
  const url = raster.tileUrl('2026-10-19', 5, 25, 16);
  assert.strictEqual(url,
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' + raster.LAYER_ID
      + '/default/2026-10-19/GoogleMapsCompatible_Level6/5/16/25.png');
});
test('URL tile menolak koordinat atau tanggal di luar skema', () => {
  assert.throws(() => raster.tileUrl('../x', 5, 1, 1));
  assert.throws(() => raster.tileUrl('2026-10-19', 7, 0, 0));
});
test('signature PNG diperlukan sebelum petak dikirim ke klien', () => {
  assert.strictEqual(raster.isPng(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.strictEqual(raster.isPng(Buffer.from('not an image')), false);
});

test('sakelar memakai proksi same-origin serta menampilkan proses dan galat petak', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert(app.includes("fetchT('/api/aerosol-raster/meta'"));
  assert(app.includes("L.tileLayer('/api/aerosol-raster/'"));
  assert(app.includes("layer.on('tileerror'"));
  assert(app.includes("setAttribute('aria-busy'"));
});
test('panel sumber memberi atribusi dan batas interpretasi raster', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert(html.includes('id="lyAerosol"'));
  assert(html.includes('Aerosol satelit: NASA OMPS NOAA-21'));
  assert(html.includes('Atribusi: NASA GIBS / OMPS NOAA-21'));
  assert(html.includes('bukan PM2.5 permukaan'));
  assert(html.includes('Area transparan bukan bukti udara bersih'));
});

console.log(`\n${passed}/12 uji raster aerosol lulus.\n`);
