#!/usr/bin/env node
'use strict';
/**
 * Uji modul kamera web Windy, ikut `npm run check`.
 *
 * Tanpa jaringan. Janji yang dijaga modul ini, dan yang diuji di sini:
 *
 *   1. tanpa kunci API, modul TIDAK menghubungi jaringan sama sekali dan
 *      melaporkan keadaannya apa adanya (bukan daftar kosong yang tampak
 *      seperti "tidak ada kamera")
 *   2. kunci hanya dipakai di server: dikirim sebagai header, tidak pernah
 *      ikut di dalam data yang dikirim ke peramban
 *   3. alamat gambar tetap di server; yang dikirim ke peramban hanya tanda
 *      bahwa gambarnya ada
 *   4. filtrer yang dipakai adalah kode negara, bukan kotak koordinat, karena
 *      kotak Windy dibatasi tingkat pembesaran sedangkan Indonesia membentang
 *      47 derajat bujur
 *   5. kegagalan sumber dilaporkan sebagai kegagalan, bukan sebagai ketiadaan
 *      kamera, dan salinan lama selalu berlabel
 */

const path = require('path');
const fs = require('fs');
const webcams = require('../lib/webcams');

let lulus = 0;
let gagal = 0;
function cek(nama, benar, catatan) {
  if (benar) { lulus++; console.log('  LULUS ' + nama + (catatan ? '  (' + catatan + ')' : '')); }
  else { gagal++; console.log('  GAGAL ' + nama + (catatan ? '  (' + catatan + ')' : '')); }
}

const t0 = 1_000_000_000_000;
const KUNCI = 'kunci-uji-123';
const CONTOH = [
  {
    webcamId: 1001, title: 'Merapi sisi selatan',
    location: { city: 'Sleman', region: 'DI Yogyakarta', country: 'Indonesia', latitude: -7.6, longitude: 110.44 },
    images: { current: { preview: 'https://cdn.windy.test/1001.jpg', update: 1791178828 } },
    urls: { detail: 'https://www.windy.com/webcams/1001' }
  },
  {
    webcamId: 1002, title: 'Pelabuhan Tanjung Priok',
    location: { city: 'Jakarta', country: 'Indonesia', latitude: null, longitude: null },
    images: { current: {} },
    urls: {}
  },
  { webcamId: null, title: 'rusak' },
  {
    webcamId: 1001, title: 'Merapi sisi selatan (ganda)',
    location: { city: 'Sleman', country: 'Indonesia', latitude: -7.6, longitude: 110.44 },
    images: { current: { preview: 'https://cdn.windy.test/1001.jpg' } },
    urls: {}
  }
];

function balasanStub(payload, status) {
  return {
    ok: status ? status < 400 : true,
    status: status || 200,
    headers: { get: function () { return 'image/jpeg'; } },
    json: async function () { return payload; },
    // Isi gambar dijawab sebagai byte; modul mengambilnya utuh supaya tidak
    // bergantung pada jenis aliran yang dipakai lingkungan produksi.
    arrayBuffer: async function () { return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer; }
  };
}

/** fetch palsu yang mencatat semuanya, termasuk keadaan tanpa kunci. */
function fetchPalsu(opsi) {
  opsi = opsi || {};
  const catatan = { panggilan: [], header: null, url: [] };
  const f = async function (url, init) {
    catatan.panggilan.push(url);
    catatan.url.push(url);
    catatan.header = (init && init.headers) || null;
    if (opsi.gagal) {
      const e = new Error(opsi.gagal);
      if (opsi.abort) e.name = 'AbortError';
      throw e;
    }
    // Alamat gambar dijawab sebagai isi mentah; daftar dijawab sebagai JSON.
    if (opsi.mentah || /cdn\.windy\.test/.test(url)) return balasanStub(null);
    return balasanStub(opsi.payload === undefined ? CONTOH : opsi.payload);
  };
  f.catatan = catatan;
  return f;
}

(async function () {
  console.log('\n[1] Tanpa kunci: jujur dan tanpa jaringan');
  delete process.env.WINDY_WEBCAMS_KEY;
  delete process.env.WINDY_API_KEY;
  webcams._setCache(null);
  const f0 = fetchPalsu();
  const h0 = await webcams.ambilWebcam({ fetchImpl: f0, sekarang: t0 });
  const kead = webcams.keadaan();
  cek('keadaan menyatakan tidak aktif', kead.aktif === false);
  cek('sebabnya disebut dengan nama env-nya', /WINDY_WEBCAMS_KEY/.test(kead.sebab || ''));
  cek('sebabnya memuat bukti dari sumbernya', /x-windy-api-key/.test(kead.sebab || ''));
  cek('cara memasang disebut', /Environment Variables/.test(kead.caraPasang || ''));
  cek('tidak menghubungi jaringan sama sekali', f0.catatan.panggilan.length === 0,
    f0.catatan.panggilan.length + ' panggilan');
  cek('ok=false, bukan ok=true dengan daftar kosong', h0.ok === false && h0.item.length === 0);
  cek('galat kosong: ini keadaan, bukan kegagalan', h0.galat === null);
  cek('atribusi tetap disebut walau tidak aktif', h0.atribusi === 'Windy.com');

  console.log('\n[2] Dengan kunci: permintaan yang benar');
  process.env.WINDY_WEBCAMS_KEY = KUNCI;
  webcams._setCache(null);
  const f1 = fetchPalsu();
  const h1 = await webcams.ambilWebcam({ fetchImpl: f1, sekarang: t0 });
  cek('satu permintaan saja', f1.catatan.panggilan.length === 1, f1.catatan.panggilan.length + ' panggilan');
  const u = f1.catatan.panggilan[0];
  cek('memfilter dengan kode negara, bukan kotak koordinat', /countries=ID/.test(u) && !/bbox=/.test(u));
  cek('tidak memakai parameter kotak koordinat', !/northLat|southLat/.test(u));
  cek('bahasa diminta Indonesia', /lang=id/.test(u));
  cek('bagian yang diminta disebut jelas', /include=location%2Cimages%2Curls|include=location,images,urls/.test(u));
  cek('batas jumlah tidak melampaui batas resmi', /limit=50/.test(u) && webcams.LIMIT_MAKS === 50);
  cek('kunci dikirim sebagai header sumber', (f1.catatan.header || {})['x-windy-api-key'] === KUNCI);
  cek('hasil ok dan terisi', h1.ok === true && h1.jumlah === 2, h1.jumlah + ' kamera');

  console.log('\n[3] Bentuk data yang sampai ke peramban');
  const satu = h1.item[0];
  cek('judul, kota, negara dipakai apa adanya', satu.judul === 'Merapi sisi selatan' && satu.kota === 'Sleman'
    && satu.negara === 'Indonesia');
  cek('koordinat kamera yang punya posisi', satu.lat === -7.6 && satu.lon === 110.44);
  cek('tanda ada gambar terisi', satu.adaFoto === true);
  cek('ALAMAT GAMBAR TIDAK DIKIRIM ke peramban', satu._fotoUrl === undefined
    && JSON.stringify(h1).indexOf('cdn.windy.test') === -1);
  cek('waktu foto dikonversi ke ISO', /^20\d\d-/.test(satu.waktuFoto || ''), String(satu.waktuFoto));
  const dua = h1.item[1];
  cek('kamera tanpa koordinat tidak dipaksa punya koordinat', dua.lat === null && dua.lon === null);
  cek('kamera tanpa gambar ditandai tidak ada gambar', dua.adaFoto === false);
  cek('tautan cadangan dibentuk dari id, bukan dikarang dari judul',
    dua.tautan === 'https://www.windy.com/webcams/1002', dua.tautan);
  cek('kamera rusak dan ganda dibuang', h1.jumlah === 2);

  console.log('\n[4] Cache menjaga kuota tingkat gratis');
  const h2 = await webcams.ambilWebcam({ fetchImpl: f1, sekarang: t0 + 60000 });
  cek('panggilan kedua memakai cache', f1.catatan.panggilan.length === 1 && h2.dariCache === true);
  cek('umur data dilaporkan', h2.umurMs === 60000, String(h2.umurMs));
  cek('masa cache jauh di bawah kuota harian', webcams.CACHE_MS >= 10 * 60 * 1000
    && (24 * 60 * 60 * 1000) / webcams.CACHE_MS <= 100, String(webcams.CACHE_MS / 60000) + ' menit');
  const h3 = await webcams.ambilWebcam({ fetchImpl: f1, sekarang: t0 + webcams.CACHE_MS + 1000 });
  cek('lewat masa cache -> ambil lagi', f1.catatan.panggilan.length === 2 && h3.dariCache === false);

  console.log('\n[5] Kegagalan sumber tidak menjadi "tidak ada kamera"');
  webcams._setCache(null);
  const fGagal = fetchPalsu({ gagal: 'HTTP 403' });
  const hGagal = await webcams.ambilWebcam({ fetchImpl: fGagal, sekarang: t0 });
  cek('ok=false saat sumber menolak', hGagal.ok === false);
  cek('kunci yang ditolak disebut sebabnya', /kunci API ditolak/.test(hGagal.galat || ''), String(hGagal.galat));
  cek('daftar kosong, bukan dikarang', hGagal.item.length === 0 && hGagal.jumlah === 0);
  const fTimeout = fetchPalsu({ gagal: 'dibatalkan', abort: true });
  const hTimeout = await webcams.ambilWebcam({ fetchImpl: fTimeout, sekarang: t0 });
  cek('batas waktu dilaporkan sebagai batas waktu, bukan galat samar',
    /batas waktu/.test(hTimeout.galat || ''), String(hTimeout.galat));
  webcams._setCache(null);
  const fHidup = fetchPalsu();
  await webcams.ambilWebcam({ fetchImpl: fHidup, sekarang: t0 });
  const hBasi = await webcams.ambilWebcam({ fetchImpl: fGagal, sekarang: t0 + webcams.CACHE_MS + 60000, paksa: true });
  cek('salinan lama tetap dikirim saat sumber gagal', hBasi.item.length === 2);
  cek('salinan lama ditandai basi', hBasi.basi === true);

  console.log('\n[6] Thumbnail dialirkan server, daftar CSP tetap ketat');
  webcams._setCache(null);
  const fImg = fetchPalsu();
  await webcams.ambilWebcam({ fetchImpl: fImg, sekarang: t0 });
  const img = await webcams.ambilFoto('1001', { fetchImpl: fImg });
  cek('gambar kamera yang ada di daftar diambil', img.ok === true);
  cek('tipe isi diteruskan', img.tipe === 'image/jpeg', String(img.tipe));
  cek('alamat gambar diambil dari daftar di server',
    fImg.catatan.url.some(function (x) { return x === 'https://cdn.windy.test/1001.jpg'; }));
  const imgMiss = await webcams.ambilFoto('9999', { fetchImpl: fImg });
  cek('kamera tanpa gambar menjawab jujur', imgMiss.ok === false && /tidak ada di daftar/.test(imgMiss.galat));
  delete process.env.WINDY_WEBCAMS_KEY;
  webcams._setCache(null);
  const imgOff = await webcams.ambilFoto('1001', { fetchImpl: fImg });
  cek('tanpa kunci, foto tidak dilayani', imgOff.ok === false && /belum dipasang/.test(imgOff.galat));

  console.log('\n[7] Sambungan rute dan antarmuka');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public/app.js'), 'utf8');
  const pkg = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8');
  cek('rute /api/webcams ada', server.includes("app.get('/api/webcams'"));
  cek('rute foto ada dan mengalirkan gambar', server.includes("app.get('/api/webcams/foto'"));
  // Nama env boleh disebut di naskah penjelasan panel Sumber (memang perlu,
  // supaya pembaca tahu cara mengaktifkannya), tetapi nilainya tidak pernah
  // sampai ke peramban dan app.js tidak membacanya sendiri.
  cek('app.js tidak membaca kunci sama sekali', !/WINDY_WEBCAMS_KEY|WINDY_API_KEY/.test(js));
  // Naskah penjelasan di panel Sumber memang menyebut alamat dan nama header
  // sumbernya; yang dilarang adalah MEMANGGILNYA dari peramban.
  cek('app.js tidak memanggil api.windy.com', !/api\.windy\.com/.test(js));
  cek('panel tidak memuat pemanggil Windy dari peramban',
    !/fetch\(['"]https:\/\/api\.windy/.test(html) && !/src=["']https:\/\/api\.windy/.test(html));
  cek('header kunci tidak ditulis di app.js', !/x-windy-api-key/.test(js));
  cek('panel Siaran memuat bagian Windy', html.includes('id="daftarWindy"') && html.includes('id="windyMeta"'));
  cek('tidak mengklaim siaran langsung', !/["'>]LIVE[<"']/.test(html));
  cek('atribusi Windy wajib tampil', js.includes('Windy.com'));
  cek('ada tautan keluar ke peta kamera Windy', js.includes('https://www.windy.com/id/-Kamera-web/webcams'));
  cek('uji ini masuk gerbang npm run check', /test-webcams\.js/.test(pkg));

  console.log('\n' + '='.repeat(46));
  console.log('  ' + lulus + ' lulus, ' + gagal + ' gagal');
  console.log('='.repeat(46));
  process.exit(gagal ? 1 : 0);
})();
