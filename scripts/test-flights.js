#!/usr/bin/env node
'use strict';
/**
 * Uji modul lalu lintas udara (OpenSky, ADS-B publik), ikut `npm run check`.
 *
 * Tanpa jaringan: pengambil data disuntikkan, jadi yang diuji adalah
 * perilaku yang bisa dirusak diam-diam oleh perubahan kode, terutama
 * tiga janji yang dipegang modul ini:
 *
 *   1. baris rusak atau di luar rentang koordinat tidak pernah masuk
 *   2. salinan lama TIDAK pernah disajikan seolah baru (harus berlabel basi)
 *   3. kegagalan sumber dilaporkan sebagai kegagalan, bukan "tidak ada pesawat"
 */

const path = require('path');
const fs = require('fs');
const flights = require('../lib/flights');

let lulus = 0;
let gagal = 0;
function cek(nama, benar, catatan) {
  if (benar) { lulus++; console.log('  LULUS ' + nama + (catatan ? '  (' + catatan + ')' : '')); }
  else { gagal++; console.log('  GAGAL ' + nama + (catatan ? '  (' + catatan + ')' : '')); }
}

const BARIS_SAH = ['abc123', 'GIA123  ', 'Indonesia', 1, 2, 106.8, -6.2, 10000, false, 230, 90,
  0, null, 10200, '1200', false, 0];

function balasanStub(payload, status) {
  return { ok: status ? status < 400 : true, status: status || 200, json: async () => payload };
}

(async function () {
  console.log('\n[1] Normalisasi baris');
  const satu = flights.normalisasiBaris(BARIS_SAH);
  cek('callsign dipangkas', satu.callsign === 'GIA123');
  cek('ketinggian geodetik didahulukan', satu.altM === 10200);
  cek('koordinat apa adanya', satu.lat === -6.2 && satu.lon === 106.8);

  const tanpaAlt = flights.normalisasiBaris(['x', 'A', 'X', 1, 2, 100, 0, 1500, false, 0, 0, 0, null, null]);
  cek('ketinggian kosong memakai barometrik', tanpaAlt.altM === 1500);
  const tanpaAltDua = flights.normalisasiBaris(['x', 'A', 'X', 1, 2, 100, 0, null, false, 0, 0, 0, null, null]);
  cek('keduanya kosong -> null, bukan nol', tanpaAltDua.altM === null);
  cek('callsign kosong -> null', flights.normalisasiBaris(['x', '   ', 'X', 1, 2, 100, 0, 1, false, 0, 0, 0, null, null]).callsign === null);

  console.log('\n[2] Menolak baris rusak');
  const kotor = flights.normalisasi({ states: [
    BARIS_SAH,
    null,
    'bukan array',
    ['x', 'A', 'X', 1, 2, 999, 999, 1, false, 0, 0, 0, null, 1],
    ['x', 'A', 'X', 1, 2, null, null, 1, false, 0, 0, 0, null, 1]
  ]});
  cek('hanya baris sah yang lolos', kotor.length === 1, kotor.length + ' dari 5');
  cek('payload tanpa states -> daftar kosong', flights.normalisasi({}).length === 0);
  cek('payload null -> daftar kosong', flights.normalisasi(null).length === 0);

  console.log('\n[3] Cache: jatah sumber dijaga');
  flights._setCache(null);
  let panggilan = 0;
  const fetchStub = async () => { panggilan++; return balasanStub({ states: [BARIS_SAH] }); };
  const t0 = 1_000_000_000_000;
  const a1 = await flights.ambilPenerbangan({ fetchImpl: fetchStub, sekarang: t0 });
  const a2 = await flights.ambilPenerbangan({ fetchImpl: fetchStub, sekarang: t0 + 60000 });
  cek('panggilan kedua memakai cache', panggilan === 1 && a2.dariCache === true, panggilan + ' panggilan');
  cek('umur data dilaporkan', a2.umurMs === 60000, String(a2.umurMs));
  const a3 = await flights.ambilPenerbangan({ fetchImpl: fetchStub, sekarang: t0 + flights.CACHE_MS + 1 });
  cek('lewat masa cache -> ambil lagi', panggilan === 2 && a3.dariCache === false);
  cek('tanpa paksa tidak pernah melebihi cache', a1.ok === true && a1.galat === null);

  console.log('\n[4] Kegagalan sumber tidak menjadi "tidak ada pesawat"');
  flights._setCache(null);
  const hasilGagal = await flights.ambilPenerbangan({
    fetchImpl: async () => balasanStub({}, 503),
    sekarang: t0
  });
  cek('ok=false saat sumber gagal', hasilGagal.ok === false);
  cek('alasan kegagalan disertakan', /503/.test(hasilGagal.galat || ''), hasilGagal.galat);
  cek('daftar kosong, bukan dikarang', hasilGagal.items.length === 0 && hasilGagal.jumlah === 0);
  cek('bukan ditandai basi saat belum ada salinan', hasilGagal.basi === false);

  console.log('\n[5] Salinan lama wajib berlabel basi');
  flights._setCache(null);
  await flights.ambilPenerbangan({ fetchImpl: async () => balasanStub({ states: [BARIS_SAH] }), sekarang: t0 });
  const basi = await flights.ambilPenerbangan({
    fetchImpl: async () => { throw new Error('jaringan mati'); },
    sekarang: t0 + flights.CACHE_MS + 60000
  });
  cek('ok=false saat gagal walau ada salinan', basi.ok === false);
  cek('salinan lama tetap dikirim', basi.items.length === 1);
  cek('ditandai basi', basi.basi === true);
  cek('umur salinan dilaporkan apa adanya', basi.umurMs === flights.CACHE_MS + 60000, String(basi.umurMs));
  cek('alasan kegagalan terbaca', /jaringan mati/.test(basi.galat || ''), basi.galat);

  console.log('\n[6] Kotak wilayah Indonesia');
  const k = flights.KOTAK;
  cek('mencakup ujung barat sampai timur', k.lomin <= 95.3 && k.lomax >= 141.0, k.lomin + '..' + k.lomax);
  cek('mencakup ujung utara sampai selatan', k.lamax >= 5.9 && k.lamin <= -10.9, k.lamin + '..' + k.lamax);
  cek('masa cache menjaga jatah harian', flights.CACHE_MS >= 10 * 60 * 1000, flights.CACHE_MS / 60000 + ' menit');

  console.log('\n[7] Sambungan antarmuka dan rute');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public/app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  cek('sakelar lapisan ada', html.includes('id="lyFlights"') && html.includes('id="fltMeta"'));
  cek('grup lapisan terpisah', /var gFlights = L\.layerGroup\(\)/.test(js));
  cek('rute /api/flights ada', server.includes("app.get('/api/flights'"));
  cek('lapisan ikut keadaan kotak centang saat dimuat', /if \(state\.flightsOn\) loadFlights\(\);/.test(js));
  cek('penyegaran hanya saat lapisan menyala', /if \(state\.flightsOn\) loadFlights\(\); \}, 5 \* 60 \* 1000\)/.test(js));
  cek('kegagalan tidak digambar sebagai ketiadaan pesawat',
    js.includes('Sumber lalu lintas udara tidak tersedia ('));
  // Yang diuji adalah TIDAK ADANYA lapisan itu, bukan tidak adanya kata di
  // penjelasan. Justru penjelasannya yang menyatakan batas ini secara terbuka.
  cek('tidak ada sakelar lapisan militer/privat', !/id="ly(Military|Private|Jets)/.test(html));
  cek('batas dinyatakan terbuka di panel Sumber',
    html.includes('Tidak ada lapisan militer maupun jet pribadi'));
  cek('tidak ada permintaan data militer di kode antarmuka', !/military|jet pribadi"\s*:/i.test(js));
  cek('keterangan menyebut keterbatasan cakupan ADS-B',
    js.includes('jaringan penerima tidak rapat') && html.includes('Jaringan penerima tidak rapat'));

  console.log('\n' + '='.repeat(46));
  console.log('  ' + lulus + ' lulus, ' + gagal + ' gagal');
  console.log('='.repeat(46));
  process.exit(gagal ? 1 : 0);
})();
