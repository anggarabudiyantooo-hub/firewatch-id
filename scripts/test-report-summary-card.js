'use strict';
/**
 * Uji penjaga: kartu ringkasan tidak boleh mengarang angka.
 *
 * Arsip harian menyimpan deteksi FIRMS, peringkat provinsi kotak kasar, dan
 * status sumber. Ia TIDAK menyimpan AQI/PM2.5 dan tidak menyimpan daftar
 * kabupaten. Kartu ringkasan karena itu harus menyatakan keduanya tidak
 * tersedia, bukan menuliskan nol dan bukan meminta angka ke model.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'public', 'reports.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'report-capture.css'), 'utf8');

let pass = 0;
let fail = 0;
function ok(label, fn) {
  try { fn(); pass += 1; console.log('  LULUS ' + label); }
  catch (error) { fail += 1; console.log('  GAGAL ' + label + ': ' + error.message); }
}

console.log('== kartu dipasang di atas isi laporan ==');
ok('kartu dibangun sebelum isi laporan harian', () => {
  assert.match(src, /html = renderSummaryCard\(snapshot\) \+ renderDaily\(snapshot\);/);
});
ok('semua angka dibaca dari snapshot, bukan fetch baru', () => {
  const body = src.slice(src.indexOf('function renderSummaryCard'), src.indexOf('function renderDaily(snapshot)'));
  assert.ok(!/fetch\(/.test(body), 'kartu tidak boleh mengambil data sendiri');
  assert.match(body, /snapshot\.observations && snapshot\.observations\.hotspots/);
  assert.match(body, /snapshot\.coverage/);
});

console.log('\n== yang tidak disimpan dinyatakan tidak tersedia ==');
ok('AQI/PM2.5 tidak dikarang', () => {
  assert.match(src, /tidak disimpan di arsip/);
  assert.match(src, /not stored in the archive/);
});
ok('kabupaten/kota dinyatakan tidak disimpan', () => {
  assert.match(src, /Kabupaten\/kota tidak disimpan di arsip ini/);
  assert.match(src, /Regencies\/cities are not stored in this issue/);
});
ok('peringkat wilayah disebut kotak kasar, bukan batas administratif', () => {
  assert.match(src, /Kotak persegi kasar, bukan batas administratif/);
  assert.match(src, /Coarse rectangular boxes, not administrative borders/);
});
ok('feed gagal bukan nol', () => {
  assert.match(src, /Feed yang gagal berarti tidak tersedia, bukan nol/);
  assert.match(src, /A failed feed means unavailable, not zero/);
});
ok('deteksi panas bukan luas terbakar', () => {
  assert.match(src, /Deteksi panas, bukan luas terbakar/);
  assert.match(src, /Heat detections, not burned area/);
});
ok('CAMS disebut model dan bukan khusus asap', () => {
  assert.match(src, /Nilai model bukan pengukuran stasiun dan bukan khusus asap/);
  assert.match(src, /Model values are not station measurements and are not smoke-specific/);
});

console.log('\n== metode dilipat, bukan dibuang ==');
ok('metode memakai details/summary', () => {
  assert.match(src, /<details class="report-sum-method"><summary>/);
  assert.match(src, /snapshot\.notes && snapshot\.notes\.method/);
});
ok('metode menyebut angka tidak diminta ke model', () => {
  assert.match(src, /dibaca dari berkas arsip, bukan diminta ke model/);
  assert.match(src, /read from the archive file, not requested from a model/);
});
ok('CSS kartu tersedia dan responsif', () => {
  assert.match(css, /\.report-summary \{/);
  assert.match(css, /\.report-sum-grid \{/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*?\.report-sum-grid \{ grid-template-columns: 1fr; \}/);
});

console.log('\n' + pass + '/' + (pass + fail) + ' uji kartu ringkasan lulus.');
process.exit(fail ? 1 : 0);
