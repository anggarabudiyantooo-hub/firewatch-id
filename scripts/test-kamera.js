#!/usr/bin/env node
'use strict';
/**
 * Uji panel Siaran (kamera & siaran publik), ikut `npm run check`.
 *
 * Tanpa jaringan. Yang diuji bukan apakah kanal itu benar-benar menyiarkan
 * saat ini, sebab itu milik YouTube dan tidak dapat diukur dari sini, tetapi
 * hal-hal yang bisa dirusak diam-diam oleh perubahan kode:
 *
 *   - bentuk data kurasi (id unik, kanal berformat benar, tanggal diperiksa)
 *   - aturan "yang tidak dipetakan tidak diberi koordinat"
 *   - ringkasan yang dihitung modul, bukan ditulis ulang di balasan API
 *   - sambungan antarmuka: tab, panel, wadah daftar, dan izin CSP untuk
 *     pemutar YouTube. Tanpa izin itu, tombol "Tampilkan siaran" akan gagal
 *     di produksi walau di lokal tampak normal.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const kamera = require('../lib/kamera');

let lulus = 0;
let gagal = 0;

function cek(nama, benar, catatan) {
  if (benar) { lulus++; console.log('  LULUS ' + nama + (catatan ? '  (' + catatan + ')' : '')); }
  else { gagal++; console.log('  GAGAL ' + nama + (catatan ? '  (' + catatan + ')' : '')); }
}

console.log('\n[1] Bentuk data kurasi');
const daftar = kamera.daftar();
cek('daftar tidak kosong', daftar.length > 0, daftar.length + ' sumber');

const id = new Set();
let bentukBenar = true;
let tanggalBenar = true;
let kanalBenar = true;
let koordinatBenar = true;
let teksBenar = true;
for (const k of daftar) {
  if (id.has(k.id)) bentukBenar = false;
  id.add(k.id);
  if (!k.nama || !k.pemilik || !k.wilayah || !k.tautan) teksBenar = false;
  if (!k.catatan || !k.bukti || k.bukti.length < 30) teksBenar = false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k.diperiksa || '')) tanggalBenar = false;
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(k.kanal || '')) kanalBenar = false;
  if (!['resmi', 'komunitas'].includes(k.sifat)) bentukBenar = false;
  if (!['kamera', 'kanal'].includes(k.jenis)) bentukBenar = false;
  const ada = typeof k.lat === 'number' && typeof k.lon === 'number';
  const setengah = (typeof k.lat === 'number') !== (typeof k.lon === 'number');
  if (setengah) koordinatBenar = false;
  if (ada && (k.lat < -90 || k.lat > 90 || k.lon < -180 || k.lon > 180)) koordinatBenar = false;
}
cek('id unik dan jenis/sifat dikenal', bentukBenar);
cek('kolom teks wajib terisi', teksBenar);
cek('tanggal pemeriksaan berformat YYYY-MM-DD', tanggalBenar);
cek('id kanal YouTube berformat benar', kanalBenar);
cek('koordinat selalu lengkap atau tidak ada sama sekali', koordinatBenar);

console.log('\n[2] Aturan pemetaan');
const peta = kamera.berpeta();
cek('hanya sumber berlokasi tetap yang dipetakan', peta.every(function (k) {
  return typeof k.lat === 'number' && typeof k.lon === 'number';
}), peta.length + ' dari ' + daftar.length + ' sumber');
cek('kamera komunitas berpindah tidak dipetakan', daftar.filter(function (k) {
  return k.sifat === 'komunitas';
}).every(function (k) {
  return typeof k.lat !== 'number';
}), 'sesuai kolom wilayah');

console.log('\n[3] Ringkasan dihitung, bukan ditulis ulang');
const r = kamera.ringkas();
cek('jumlah cocok dengan daftar', r.jumlah === daftar.length);
cek('hitungan resmi + komunitas = jumlah', r.resmi + r.komunitas === r.jumlah);
cek('hitungan kamera + kanal = jumlah', r.kamera + r.kanal === r.jumlah);
cek('tanggal ringkasan terisi', !!r.diperiksa, String(r.diperiksa));

console.log('\n[4] Sambungan antarmuka');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/app.css'), 'utf8');
cek('tab Siaran ada', html.includes('id="dt-siaran"') && html.includes('aria-controls="d-siaran"'));
cek('panel Siaran ada', html.includes('id="d-siaran"') && html.includes('role="tabpanel"'));
cek('wadah daftar ada', html.includes('id="daftarSiaran"'));
cek('pemuat daftar dipanggil saat mulai', /loadOverview\(\);\s*\n\s*muatSiaran\(\);/.test(js));
cek('pemutar disematkan lewat domain tanpa cookie', js.includes("youtube-nocookie.com/embed/live_stream?channel="));
cek('pemutar hanya setelah tombol ditekan', js.includes("tombol.addEventListener('click', function () { sematSiaran("));
cek('CSP mengizinkan bingkai pemutar', /frameSrc: \['https:\/\/www\.youtube-nocookie\.com'\]/.test(server));
// Lencana LIVE pernah jadi kebiasaan dasbor lain. Di sini tidak ada, karena
// status siaran tidak diukur; yang ada hanya tombol dan catatan pemiliknya.
cek('tidak ada lencana LIVE di antarmuka', !/['"]LIVE['"]|>LIVE</.test(js + html));
cek('gaya kartu siaran ada', css.includes('.siaran-card') && css.includes('.siaran-frame iframe'));

console.log('\n' + '='.repeat(46));
console.log('  ' + lulus + ' lulus, ' + gagal + ' gagal');
console.log('='.repeat(46));
process.exit(gagal ? 1 : 0);
