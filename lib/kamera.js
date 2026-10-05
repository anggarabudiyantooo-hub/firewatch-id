'use strict';

/**
 * Modul daftar kamera & siaran publik.
 *
 * Modul ini sengaja tipis: ia hanya membaca `data/kamera.js` dan menyusun
 * ringkasan. Tidak ada pengambilan data dari YouTube di server, karena
 * halaman kanal adalah HTML milik pihak lain: mengambilnya berkala berarti
 * menyalin dan rapuh, sedangkan status siaran bukan milik kami untuk
 * diklaim. Yang dilakukan aplikasi ini adalah MENAMPILKAN kanal resmi dan
 * menyebut pemiliknya apa adanya.
 */

const DAFTAR = require('../data/kamera');

/** Salinan jujur dari daftar kurasi. Pemanggil tidak boleh mengubah aslinya. */
function daftar() {
  return DAFTAR.map(function (k) {
    return Object.assign({}, k);
  });
}

/** Hanya entri yang punya koordinat tetap; sisanya tidak layak dipetakan. */
function berpeta() {
  return daftar().filter(function (k) {
    return typeof k.lat === 'number' && typeof k.lon === 'number';
  });
}

function ringkas() {
  const semua = daftar();
  return {
    jumlah: semua.length,
    kamera: semua.filter(function (k) { return k.jenis === 'kamera'; }).length,
    kanal: semua.filter(function (k) { return k.jenis === 'kanal'; }).length,
    resmi: semua.filter(function (k) { return k.sifat === 'resmi'; }).length,
    komunitas: semua.filter(function (k) { return k.sifat === 'komunitas'; }).length,
    diperiksa: semua.length ? semua[0].diperiksa : null
  };
}

module.exports = { daftar: daftar, berpeta: berpeta, ringkas: ringkas };
