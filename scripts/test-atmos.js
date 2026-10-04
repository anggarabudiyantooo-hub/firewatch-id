'use strict';
/**
 * Uji perhitungan atmosfer.
 *
 * Dijalankan tanpa jaringan supaya dapat dipakai sebagai penjaga regresi
 * di CI. Menguji hal-hal yang bila salah tidak menimbulkan galat apa pun,
 * hanya menghasilkan arah abu yang keliru, jenis kekeliruan yang paling
 * sulit terlihat.
 */

const a = require('../lib/atmos');

let lulus = 0;
let gagal = 0;

function cek(nama, dapat, harap, toleransi) {
  const tol = toleransi === undefined ? 0.001 : toleransi;
  const ok = typeof harap === 'number'
    ? Math.abs(dapat - harap) <= tol
    : JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) { lulus++; } else {
    gagal++;
    console.log(`  GAGAL  ${nama}\n         dapat  ${JSON.stringify(dapat)}\n         harap  ${JSON.stringify(harap)}`);
  }
}

function bagian(judul) { console.log('\n' + judul); }

/* ---------- konvensi arah meteorologi ---------- */

bagian('Arah datang -> arah pergi');
cek('0 (utara) -> 180 (selatan)', a.toDirection(0), 180);
cek('90 (timur) -> 270 (barat)', a.toDirection(90), 270);
cek('180 (selatan) -> 0 (utara)', a.toDirection(180), 0);
cek('270 (barat) -> 90 (timur)', a.toDirection(270), 90);
cek('bolak-balik kembali ke asal', a.fromDirection(a.toDirection(123)), 123);
cek('360 diperlakukan sebagai 0', a.toDirection(360), 180);
cek('negatif dinormalkan', a.toDirection(-90), 90);

bagian('Komponen u/v');
// u positif ke timur, v positif ke utara
let r = a.fromUV(0, -5);
cek('u=0 v=-5 datang dari utara', Math.round(r.from), 0);
r = a.fromUV(-5, 0);
cek('u=-5 v=0 datang dari timur', Math.round(r.from), 90);
r = a.fromUV(0, 5);
cek('u=0 v=5 datang dari selatan', Math.round(r.from), 180);
r = a.fromUV(5, 0);
cek('u=5 v=0 datang dari barat', Math.round(r.from), 270);

const uv = a.toUV(10, 270);
cek('toUV(10,270) u mendekati +10', Math.round(uv.u), 10);
cek('toUV(10,270) v mendekati 0', Math.round(uv.v), 0);
const balik = a.fromUV(uv.u, uv.v);
cek('toUV lalu fromUV kembali', Math.round(balik.from), 270);
cek('kecepatan terjaga', Math.round(balik.speed), 10);

bagian('Selisih sudut');
cek('350 vs 10 berjarak 20', a.angleDiff(350, 10), 20);
cek('0 vs 180 berjarak 180', a.angleDiff(0, 180), 180);
cek('90 vs 270 berjarak 180', a.angleDiff(90, 270), 180);
cek('45 vs 45 berjarak 0', a.angleDiff(45, 45), 0);

/* ---------- ketinggian abu ---------- */

bagian('Ketinggian abu: di atas puncak vs AMSL');
let t = a.ashTopAMSL(3657, 1000);
cek('Semeru 3657 + kolom 1000 = 4657', t.ashTopM, 4657);
t = a.ashTopAMSL(2910, 2000);
cek('Merapi 2910 + kolom 2000 = 4910', t.ashTopM, 4910);
t = a.ashTopAMSL(285, 1000);
cek('Anak Krakatau 285 + 1000 = 1285', t.ashTopM, 1285);
t = a.ashTopAMSL(3657, null);
cek('tinggi tidak teramati -> null', t.ashTopM, null);
t = a.ashTopAMSL(null, 1500);
cek('elevasi tidak diketahui -> pakai kolom saja', t.ashTopM, 1500);
cek('  dan basisnya dinyatakan', t.basis.indexOf('tidak diketahui') >= 0, true);
t = a.ashTopAMSL(3657, 0);
cek('kolom nol -> null', t.ashTopM, null);
t = a.ashTopAMSL(3657, -100);
cek('kolom negatif -> null', t.ashTopM, null);

/* ---------- pemilihan aras tekanan ---------- */

bagian('Pengapit aras tekanan');
let br = a.bracketLevels(4657, null);
cek('4657 m diapit 600 dan 500 hPa', [br.lower.hPa, br.upper.hPa], [600, 500]);
br = a.bracketLevels(1000, null);
cek('1000 m diapit 925 dan 850 hPa', [br.lower.hPa, br.upper.hPa], [925, 850]);
br = a.bracketLevels(50, null);
cek('di bawah aras terendah -> 1000 hPa', [br.lower.hPa, br.upper.hPa], [1000, 1000]);
br = a.bracketLevels(20000, null);
cek('di atas aras tertinggi -> 200 hPa', [br.lower.hPa, br.upper.hPa], [200, 200]);

bagian('Ketinggian geopotensial nyata mengalahkan tabel');
cek('tanpa data -> tabel', a.levelHeight(500, null), 5600);
cek('dengan data -> nilai nyata',
  a.levelHeight(500, { geopotential_height_500hPa: 5820 }), 5820);
br = a.bracketLevels(5700, { geopotential_height_500hPa: 5820, geopotential_height_600hPa: 4300 });
cek('pengapit mengikuti ketinggian nyata', [br.lower.hPa, br.upper.hPa], [600, 500]);

/* ---------- interpolasi vektor ---------- */

bagian('Interpolasi angin: vektor, bukan sudut');
// Inilah kasus yang membuat interpolasi sudut naif gagal: 350 dan 10
// berjarak 20 derajat, tetapi rata-rata aritmetiknya 180 - berlawanan arah.
const cur1 = {
  wind_speed_600hPa: 10, wind_direction_600hPa: 350,
  wind_speed_500hPa: 10, wind_direction_500hPa: 10
};
let w = a.windAtHeight(4900, cur1);
cek('350 dan 10 menghasilkan sekitar 0, bukan 180',
  a.angleDiff(w.from, 0) < 15, true);
cek('  ditandai hasil interpolasi', w.interpolated, true);
cek('  kedua aras dicatat', w.levels, [600, 500]);

const cur2 = {
  wind_speed_600hPa: 8, wind_direction_600hPa: 90,
  wind_speed_500hPa: 8, wind_direction_500hPa: 90
};
w = a.windAtHeight(4900, cur2);
cek('arah sama tetap sama', Math.round(w.from), 90);
cek('  arah pergi berlawanan', Math.round(w.to), 270);

bagian('Angin: aras kosong ditangani');
w = a.windAtHeight(4900, { wind_speed_600hPa: 5, wind_direction_600hPa: 45 });
cek('hanya satu aras tersedia -> tetap terpakai', Math.round(w.from), 45);
cek('  ditandai bukan interpolasi', w.interpolated, false);
cek('data kosong -> null', a.windAtHeight(4900, {}), null);
cek('cur null -> null', a.windAtHeight(4900, null), null);

bagian('Geser angin vertikal terdeteksi, bukan disamarkan');
const shear = {
  wind_speed_850hPa: 6, wind_direction_850hPa: 270,   // dari barat
  wind_speed_500hPa: 12, wind_direction_500hPa: 90    // dari timur
};
const bawah = a.windAtHeight(1500, shear);
const atas = a.windAtHeight(5600, shear);
cek('angin bawah bertiup ke timur', Math.round(bawah.to), 90);
cek('angin atas bertiup ke barat', Math.round(atas.to), 270);
cek('selisihnya 180 derajat', a.angleDiff(bawah.to, atas.to), 180);

/* ---------- lapisan kolom abu ---------- */

bagian('Lapisan kolom abu');
let L = a.plumeLayers(3657, 4657);        // kolom 1000 m
cek('kolom pendek -> satu aras', L.length, 1);
L = a.plumeLayers(3657, 6657);            // kolom 3000 m
cek('kolom sedang -> dua aras', L.length, 2);
L = a.plumeLayers(1000, 12000);           // kolom 11000 m
cek('kolom tinggi -> tiga aras', L.length, 3);
cek('  aras terendah di atas puncak', L[0].heightM > 1000, true);
cek('  aras tertinggi di bawah puncak kolom', L[2].heightM < 12000, true);
cek('ashTop di bawah puncak -> kosong', a.plumeLayers(3657, 3000).length, 0);
cek('ashTop null -> kosong', a.plumeLayers(3657, null).length, 0);

/* ---------- ringkasan ---------- */

console.log('\n' + '='.repeat(46));
console.log(`  ${lulus} lulus, ${gagal} gagal`);
console.log('='.repeat(46));
process.exit(gagal ? 1 : 0);
