'use strict';

/**
 * Sumber kamera & siaran publik yang ditampilkan di panel "Siaran".
 *
 * Aturan berkas ini, sama seperti sumber lain di proyek ini:
 *
 *   1. Hanya sumber yang benar-benar diperiksa yang masuk daftar. Kolom
 *      `bukti` mencatat apa yang diukur dan kapan, bukan asumsi.
 *   2. `sifat` membedakan kanal resmi dari kanal komunitas. Pembaca berhak
 *      tahu siapa yang mengoperasikan kamera sebelum memakai gambarnya.
 *   3. Kamera komunitas yang berpindah-pindah gunung TIDAK diberi koordinat,
 *      karena titik yang dipetakan akan menyesatkan. Lapisan peta hanya
 *      menerima sumber dengan lokasi tetap.
 *   4. Yang tidak tersedia ditulis tidak tersedia, tidak diganti sumber
 *      lain yang mirip.
 *
 * Kanal diverifikasi lewat halaman kanal YouTube (HTTP 200 dan externalId
 * yang cocok) serta arsip siaran langsungnya. Status siaran saat ini TIDAK
 * diukur: itu milik YouTube, dan bila tidak ada siaran, YouTube sendiri yang
 * menampilkan pesannya. Karena itu panel tidak pernah menulis "sedang live".
 */

const DIPERIKSA = '2026-10-05';

module.exports = [
  {
    id: 'merapi-bpptkg',
    nama: 'Pantauan Merapi: visual & seismik',
    pemilik: 'BPPTKG, Badan Geologi',
    sifat: 'resmi',
    jenis: 'kamera',
    wilayah: 'Merapi, DI Yogyakarta dan Jawa Tengah',
    lat: -7.5407,
    lon: 110.4462,
    kanal: 'UCqJShqNwwE9m3guJai9jqgw',
    kanalNama: 'BPPTKG Channel',
    tautan: 'https://www.youtube.com/@bpptkg/streams',
    catatan: 'Siaran resmi BPPTKG. Yang tampil adalah data mentah stasiun ' +
      'pemantauan, belum diolah; interpretasi resmi ada di laporan BPPTKG dan MAGMA.',
    bukti: 'Kanal @bpptkg HTTP 200 dan arsip siaran langsungnya ditemukan (video 38SPp4vpwx4) pada 5 Okt 2026.',
    diperiksa: DIPERIKSA
  },
  {
    id: 'ivm-komunitas',
    nama: 'Kamera gunung api bergilir',
    pemilik: 'Indonesia Volcano Monitoring',
    sifat: 'komunitas',
    jenis: 'kamera',
    wilayah: 'Indonesia, berpindah antar gunung',
    kanal: 'UCy4lDnVuPoLC32AsX_1wbGQ',
    kanalNama: 'Indonesia Volcano Monitoring',
    tautan: 'https://www.youtube.com/@indonesiavolcanomonitoring/streams',
    catatan: 'Dikelola komunitas pemantau, bukan kanal resmi. Titik kameranya ' +
      'berpindah sehingga tidak dipetakan; jangan dipakai sebagai dasar keputusan.',
    bukti: 'Kanal HTTP 200 dan arsip siaran langsungnya ditemukan (video iBonwqY-G0Y) pada 5 Okt 2026.',
    diperiksa: DIPERIKSA
  },
  {
    id: 'volcanoyt-komunitas',
    nama: 'Kamera gunung api (kanal komunitas)',
    pemilik: 'VolcanoYT',
    sifat: 'komunitas',
    jenis: 'kamera',
    wilayah: 'Indonesia, berpindah antar gunung',
    kanal: 'UCmGNVND89m5_9zQfVHF_73Q',
    kanalNama: 'VolcanoYT',
    tautan: 'https://www.youtube.com/@VolcanoYT/streams',
    catatan: 'Kanal komunitas yang pernah dikutip media untuk pantauan Merapi. ' +
      'Bukan kanal resmi dan tidak dipetakan.',
    bukti: 'Kanal HTTP 200 dan arsip siaran langsungnya ditemukan (video 8e4RwADkxjE) pada 5 Okt 2026.',
    diperiksa: DIPERIKSA
  },
  {
    id: 'bnpb-resmi',
    nama: 'Siaran resmi BNPB',
    pemilik: 'Badan Nasional Penanggulangan Bencana',
    sifat: 'resmi',
    jenis: 'kanal',
    wilayah: 'Indonesia',
    kanal: 'UCcz9b2brFsk86Z_xruJMDoA',
    kanalNama: 'BNPB Indonesia',
    tautan: 'https://www.youtube.com/@bnpb_indonesia',
    catatan: 'Kanal resmi untuk konferensi pers dan informasi bencana. ' +
      'Ini kanal informasi, bukan kamera pemantau lapangan.',
    bukti: 'Kanal @bnpb_indonesia HTTP 200 dengan judul "BNPB Indonesia" pada 5 Okt 2026.',
    diperiksa: DIPERIKSA
  },
  {
    id: 'magma-resmi',
    nama: 'Kanal resmi MAGMA Indonesia',
    pemilik: 'PVMBG, Badan Geologi',
    sifat: 'resmi',
    jenis: 'kanal',
    wilayah: 'Indonesia',
    kanal: 'UCzDAs4D5F5SoLj6OmGQnwRg',
    kanalNama: 'Magma Indonesia',
    tautan: 'https://www.youtube.com/@magma_indonesia',
    catatan: 'Kanal resmi aplikasi MAGMA. Tidak ditemukan arsip siaran langsung ' +
      'saat diperiksa, jadi kanal ini jangan diharapkan sebagai kamera.',
    bukti: 'Kanal @magma_indonesia HTTP 200 pada 5 Okt 2026; arsip siaran tidak ditemukan.',
    diperiksa: DIPERIKSA
  }
];
