#!/usr/bin/env node
'use strict';

// Gerbang gaya naskah: menjaga dua hal yang mudah rusak kembali setelah rilis,
// yaitu tanda pisah panjang dan berkas catatan proses yang tidak layak publik.
// Dijalankan sebagai langkah pertama `npm run check`, tanpa jaringan.

const fs = require('fs');
const path = require('path');

const AKAR = path.resolve(__dirname, '..');

// Direktori yang tidak diperiksa: keluaran mesin atau bukan berkas proyek.
const LEWATI_DIR = new Set([
  '.git', '.data', '.vercel', '.next', 'node_modules',
  'coverage', 'dist', 'build', 'out', 'work', 'tmp',
]);

// Berkas yang sempat dipakai untuk catatan proses dan sengaja dikeluarkan dari
// repo publik. Bila salah satunya muncul lagi, gerbang ini menolak.
const TERLARANG = ['AGENTS.md', 'antislop.md', 'skills', 'HANDOVER.md'];

const EKSTENSI = new Set([
  '.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css',
  '.yml', '.yaml', '.py', '.sh', '.txt', '.svg', '.env', '.example',
]);

// Nama berkas tanpa ekstensi yang tetap diperiksa.
const NAMA_TANPA_EKSTENSI = new Set(['LICENSE', 'Procfile', 'Dockerfile']);

// U+2014 dan U+2013 ditulis lewat kode agar berkas ini sendiri tidak memuatnya.
const TANDA_PISAH_PANJANG = String.fromCharCode(0x2014);
const TANDA_PISAH_SEDANG = String.fromCharCode(0x2013);

function berkasDiperiksa(nama) {
  if (NAMA_TANPA_EKSTENSI.has(nama)) return true;
  if (nama.startsWith('.env')) return true;
  return EKSTENSI.has(path.extname(nama).toLowerCase());
}

function telusuri(dir, keluar) {
  for (const isi of fs.readdirSync(dir, { withFileTypes: true })) {
    const jalur = path.join(dir, isi.name);
    if (isi.isDirectory()) {
      if (LEWATI_DIR.has(isi.name)) continue;
      telusuri(jalur, keluar);
    } else if (isi.isFile() && berkasDiperiksa(isi.name)) {
      keluar.push(jalur);
    }
  }
  return keluar;
}

function nomorBaris(teks, indeks) {
  return teks.slice(0, indeks).split('\n').length;
}

const berkas = telusuri(AKAR, []).sort();
const temuan = [];
let diperiksa = 0;

for (const jalur of berkas) {
  const relatif = path.relative(AKAR, jalur).split(path.sep).join('/');
  let teks;
  try {
    teks = fs.readFileSync(jalur, 'utf8');
  } catch (galat) {
    temuan.push(`${relatif}: tidak dapat dibaca (${galat.code || galat.message})`);
    continue;
  }
  diperiksa += 1;
  for (const [tanda, nama] of [
    [TANDA_PISAH_PANJANG, 'em dash (U+2014)'],
    [TANDA_PISAH_SEDANG, 'en dash (U+2013)'],
  ]) {
    let posisi = teks.indexOf(tanda);
    while (posisi !== -1) {
      temuan.push(`${relatif}:${nomorBaris(teks, posisi)}: ${nama}`);
      posisi = teks.indexOf(tanda, posisi + 1);
    }
  }
}

for (const nama of TERLARANG) {
  if (fs.existsSync(path.join(AKAR, nama))) {
    temuan.push(`${nama}: berkas catatan proses, tidak untuk repo publik`);
  }
}

console.log(`Gaya naskah: ${diperiksa} berkas diperiksa, ${temuan.length} temuan.`);
if (temuan.length) {
  for (const t of temuan.slice(0, 40)) console.log(`  ${t}`);
  if (temuan.length > 40) console.log(`  ... dan ${temuan.length - 40} lagi`);
  console.log('Pakai tanda hubung biasa, titik dua, atau tanda kurung sebagai gantinya.');
  process.exit(1);
}
