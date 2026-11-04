'use strict';
/**
 * Uji penjaga: gambar peta hanya boleh dikirim ke Meta setelah persetujuan.
 *
 * Latar belakang nyata. Jalur /api/map-narrative mengirim PNG lewat image_url
 * ke Meta Model API, tetapi teks di halaman Laporan dan README sebelumnya
 * menyatakan gambar "tidak diunggah ke server". Klaim itu keliru dan menyesatkan
 * pengunjung. Uji ini mengunci dua hal sekaligus: pengiriman harus punya
 * persetujuan eksplisit, dan tidak boleh ada teks yang menyangkal pengiriman.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

let pass = 0;
let fail = 0;
function ok(label, fn) {
  try {
    fn();
    pass += 1;
    console.log('  LULUS ' + label);
  } catch (error) {
    fail += 1;
    console.log('  GAGAL ' + label + ': ' + error.message);
  }
}

const ui = read('public/map-capture-ui.js');
const ops = read('lib/ops-routes.js');
const narrative = read('lib/map-narrative.js');

console.log('== gambar benar-benar dikirim, jadi harus disetujui ==');
ok('jalur narasi memang mengirim gambar ke Meta', () => {
  assert.match(narrative, /type: 'image_url', image_url: \{ url: dataUrl \}/);
});
ok('kotak persetujuan dibuat di dialog', () => {
  assert.match(ui, /consentBox\.id = 'mapCaptureConsent'/);
  assert.match(ui, /consentBox\.type = 'checkbox'/);
});
ok('tombol narasi mati sampai persetujuan dicentang', () => {
  assert.match(ui, /btnNarrate\.disabled = true;/);
  assert.match(ui, /btnNarrate\.disabled = !consentBox\.checked;/);
});
ok('persetujuan dijaga lagi di dalam fungsi, bukan hanya di tombol', () => {
  assert.match(ui, /if \(!consentBox \|\| !consentBox\.checked\)/);
});
ok('persetujuan tidak diwarisi tangkapan berikutnya', () => {
  assert.match(ui, /priorConsent\.checked = false;/);
});
ok('teks persetujuan menyebut Meta dan menjelaskan retensi', () => {
  assert.match(ui, /Kirim gambar peta ini ke Meta untuk dianalisis/);
  assert.match(ui, /Send this map image to Meta for analysis/);
  assert.match(ui, /tidak disimpan di server ini/);
  assert.match(ui, /not stored on this server/);
});
ok('persetujuan punya padanan Inggris', () => {
  assert.match(ui, /Without this box checked, the image is not sent anywhere\./);
});

console.log('\n== tidak ada teks yang menyangkal pengiriman ==');
const publicText = [
  'public/reports.html',
  'public/report-capture.js',
  'public/map-capture-ui.js',
  'README.md'
];
for (const file of publicText) {
  ok('tidak ada klaim "never uploaded" di ' + file, () => {
    const text = read(file);
    assert.ok(!/never uploaded/i.test(text), 'masih menyangkal pengunggahan');
    assert.ok(!/tidak diunggah ke server/.test(text), 'masih menyangkal pengunggahan');
  });
}
ok('halaman Laporan menjelaskan persetujuan narasi', () => {
  const text = read('public/reports.html');
  assert.match(text, /bila Anda menyetujuinya, gambar dan data terstruktur dikirim ke Meta/);
  assert.match(text, /if you consent, the image and structured data are sent to Meta/);
});
ok('README menjelaskan opt-in dan retensi satu permintaan', () => {
  const text = read('README.md');
  assert.match(text, /explicit opt-in/);
  assert.match(text, /held in server memory for one request/);
});

console.log('\n== pintu operator tidak dipromosikan, tetapi tetap terkunci ==');
for (const page of ['public/index.html', 'public/home.html', 'public/reports.html', 'public/cek-asap.html', 'public/tentang-data.html']) {
  ok('tanpa tautan Operator di ' + page, () => {
    assert.ok(!read(page).includes('href="/admin-login"'));
  });
}
ok('rute operations tetap menuntut sesi admin', () => {
  assert.match(ops, /adminAuth\.requirePageSession/);
});
ok('aset operations tetap dilindungi', () => {
  assert.match(ops, /app\.use\(\['\/operations', '\/insiden'\], adminAuth\.requirePageSession/);
});

console.log('\n' + pass + '/' + (pass + fail) + ' uji persetujuan gambar lulus.');
process.exit(fail ? 1 : 0);
