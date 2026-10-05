#!/usr/bin/env node
'use strict';

/**
 * Ambil snapshot lalu lintas udara untuk dipublikasikan sebagai berkas statis.
 *
 * Kenapa ada skrip ini: dari fungsi produksi Vercel, koneksi ke OpenSky
 * Network timeout, sedangkan dari runner GitHub alamat yang sama menjawab
 * 200. Penjadwal luar karena itu mengambil datanya dari jaringan yang bisa
 * menjangkau sumber, menuliskannya sebagai berkas, dan aplikasi membaca
 * berkas itu. Produksi tidak lagi bergantung pada jaringannya sendiri.
 *
 * Skrip ini memakai modul lib/flights.js yang sama dengan aplikasi, dengan
 * `tanpaSnapshot: true` supaya ia mengambil dari penyedia data dan bukan
 * membaca snapshot yang ia sendiri tulis.
 *
 * Keluaran: snapshot/flights.json
 * Keluar dengan kode 1 bila tidak ada yang bisa dipublikasikan. Snapshot
 * kosong tidak pernah ditulis: berkas kosong akan terbaca sebagai "tidak ada
 * pesawat", padahal artinya pengambilan gagal.
 */

const fs = require('fs');
const path = require('path');
const flights = require('../lib/flights');

const KELUARAN = path.join(__dirname, '..', 'snapshot', 'flights.json');

(async function () {
  const mulai = Date.now();
  const hasil = await flights.ambilPenerbangan({ paksa: true, tanpaSnapshot: true });
  const detik = ((Date.now() - mulai) / 1000).toFixed(1);

  if (!hasil.ok) {
    console.error('GAGAL: seluruh penyedia data tidak dapat dihubungi');
    console.error('  ' + (hasil.galat || 'sebab tidak diketahui'));
    process.exit(1);
  }
  if (!hasil.items.length) {
    console.error('GAGAL: sumber menjawab tetapi tanpa satu pun pesawat; snapshot tidak ditulis');
    process.exit(1);
  }

  const isi = {
    diambilAt: hasil.diambilAt,
    dibuatAt: new Date().toISOString(),
    sumber: hasil.sumber,
    penyedia: hasil.penyedia,
    cakupan: hasil.cakupan,
    jumlah: hasil.items.length,
    items: hasil.items
  };

  fs.mkdirSync(path.dirname(KELUARAN), { recursive: true });
  fs.writeFileSync(KELUARAN, JSON.stringify(isi) + '\n');

  console.log('Snapshot ditulis dalam ' + detik + ' detik');
  console.log('  penyedia : ' + isi.penyedia);
  console.log('  cakupan  : ' + (isi.cakupan && isi.cakupan.keterangan));
  console.log('  jumlah   : ' + isi.jumlah + ' pesawat');
  console.log('  diambil  : ' + isi.diambilAt);
  console.log('  berkas   : ' + KELUARAN);
})().catch(function (err) {
  console.error('GAGAL: ' + (err && err.stack ? err.stack : err));
  process.exit(1);
});
