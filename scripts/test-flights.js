#!/usr/bin/env node
'use strict';
/**
 * Uji modul lalu lintas udara (ADS-B publik), ikut `npm run check`.
 *
 * Tanpa jaringan: pengambil data disuntikkan, jadi yang diuji adalah
 * perilaku yang bisa dirusak diam-diam oleh perubahan kode. Janji yang
 * dipegang modul ini:
 *
 *   1. baris rusak atau di luar rentang koordinat tidak pernah masuk
 *   2. kolom kosong tidak pernah berubah menjadi nol yang tampak sah
 *   3. salinan lama TIDAK pernah disajikan seolah baru (harus berlabel basi)
 *   4. kegagalan sumber dilaporkan sebagai kegagalan, bukan "tidak ada pesawat"
 *   5. penyedia pertama yang gagal dilewati sementara, bukan diulang setiap
 *      kali sampai pengguna menunggu
 *   6. satuan diseragamkan di modul (kaki dan knot -> meter dan m/s)
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
const PESAWAT_LOL = {
  hex: '78018d', flight: 'CPA777  ', alt_baro: 5075, gs: 192.8, track: 168.63,
  lat: -6.1938, lon: 106.3399, t: 1791178828
};

function balasanStub(payload, status) {
  return { ok: status ? status < 400 : true, status: status || 200, json: async () => payload };
}

/** fetch palsu: membedakan OpenSky dan adsb.lol menurut URL-nya. */
function fetchPalsu(opsi) {
  opsi = opsi || {};
  const catatan = { opensky: 0, adsblol: 0, url: [] };
  const f = async function (url) {
    catatan.url.push(url);
    if (/opensky-network\.org/.test(url)) {
      catatan.opensky++;
      if (opsi.openskyGagal) {
        const e = new Error('fetch failed');
        e.cause = { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Connect Timeout Error' };
        throw e;
      }
      return balasanStub({ states: opsi.statesOpenSky || [BARIS_SAH] });
    }
    catatan.adsblol++;
    if (opsi.adsbLolGagal) throw new Error('jaringan mati');
    return balasanStub({ ac: opsi.acAdsbLol || [PESAWAT_LOL] });
  };
  f.catatan = catatan;
  return f;
}

(async function () {
  console.log('\n[1] Normalisasi baris OpenSky');
  const satu = flights.normalisasiBaris(BARIS_SAH);
  cek('callsign dipangkas', satu.callsign === 'GIA123');
  cek('ketinggian geodetik didahulukan', satu.altM === 10200);
  const tanpaAlt = flights.normalisasiBaris(['x', 'A', 'X', 1, 2, 100, 0, 1500, false, 0, 0, 0, null, null]);
  cek('ketinggian kosong memakai barometrik', tanpaAlt.altM === 1500);
  const kosong = flights.normalisasiBaris(['x', 'A', 'X', 1, 2, 100, 0, null, false, 0, 0, 0, null, null]);
  cek('keduanya kosong -> null, bukan nol', kosong.altM === null);
  cek('callsign kosong -> null',
    flights.normalisasiBaris(['x', '   ', 'X', 1, 2, 100, 0, 1, false, 0, 0, 0, null, null]).callsign === null);

  console.log('\n[2] Menolak baris rusak (koordinat 0,0 tidak boleh muncul)');
  const kotor = flights.normalisasi({ states: [
    BARIS_SAH, null, 'bukan array',
    ['x', 'A', 'X', 1, 2, 999, 999, 1, false, 0, 0, 0, null, 1],
    ['x', 'A', 'X', 1, 2, null, null, 1, false, 0, 0, 0, null, 1]
  ]});
  cek('hanya baris sah yang lolos', kotor.length === 1, kotor.length + ' dari 5');
  cek('payload tanpa states -> daftar kosong', flights.normalisasi({}).length === 0);
  cek('payload null -> daftar kosong', flights.normalisasi(null).length === 0);

  console.log('\n[3] Normalisasi adsb.lol (kaki dan knot -> meter dan m/s)');
  const lol = flights.normalisasiAdsbLol(PESAWAT_LOL);
  cek('ketinggian kaki dikonversi ke meter', lol.altM === 1547, String(lol.altM));
  cek('kecepatan knot dikonversi ke m/s', Math.abs(lol.kecepatanMs - 99.18) < 0.1, String(lol.kecepatanMs));
  cek('negara tidak ditebak', lol.negara === null);
  const darat = flights.normalisasiAdsbLol(Object.assign({}, PESAWAT_LOL, { hex: 'g1', alt_baro: 'ground' }));
  cek('"ground" -> di darat tanpa ketinggian karangan', darat.diDarat === true && darat.altM === null);
  const tanpaKoord = flights.normalisasiAdsbLol(Object.assign({}, PESAWAT_LOL, { lat: null, lon: null }));
  cek('tanpa koordinat -> dibuang', tanpaKoord === null);
  const gabung = flights.PENYEDIA[1].normalisasi({ ac: [PESAWAT_LOL, PESAWAT_LOL, Object.assign({}, PESAWAT_LOL, { hex: 'lain' })] });
  cek('pesawat ganda di dua titik tidak muncul dua kali', gabung.items.length === 2, gabung.items.length + ' dari 3 baris');
  cek('cakupan titik dilaporkan', /titik radius .* nm/.test(gabung.cakupan.keterangan), gabung.cakupan.keterangan);

  console.log('\n[4] Cache: jatah sumber dijaga');
  flights._setCache(null); flights._setTunggu({});
  const f1 = fetchPalsu();
  const t0 = 1_000_000_000_000;
  const a1 = await flights.ambilPenerbangan({ fetchImpl: f1, sekarang: t0, jedaTitikMs: 0, jedaUlangMs: 0 });
  const a2 = await flights.ambilPenerbangan({ fetchImpl: f1, sekarang: t0 + 60000 });
  cek('penyedia pertama dipakai', a1.penyedia === 'OpenSky Network', String(a1.penyedia));
  cek('panggilan kedua memakai cache', f1.catatan.opensky === 1 && a2.dariCache === true, f1.catatan.opensky + ' panggilan');
  cek('umur data dilaporkan', a2.umurMs === 60000, String(a2.umurMs));
  const a3 = await flights.ambilPenerbangan({ fetchImpl: f1, sekarang: t0 + flights.CACHE_MS + 1, jedaTitikMs: 0, jedaUlangMs: 0 });
  cek('lewat masa cache -> ambil lagi', f1.catatan.opensky === 2 && a3.dariCache === false);

  console.log('\n[5] Penyedia pertama gagal -> beralih, lalu dilewati sementara');
  flights._setCache(null); flights._setTunggu({});
  const f2 = fetchPalsu({ openskyGagal: true });
  const b1 = await flights.ambilPenerbangan({ fetchImpl: f2, sekarang: t0, jedaTitikMs: 0, jedaUlangMs: 0 });
  cek('hasil tetap ada walau OpenSky gagal', b1.ok === true && b1.jumlah > 0);
  cek('penyedia kedua dipakai', b1.penyedia === 'adsb.lol', String(b1.penyedia));
  cek('seluruh titik adsb.lol dipanggil', f2.catatan.adsblol === flights.TITIK_ADSB_LOL.length,
    f2.catatan.adsblol + ' titik');
  cek('cakupan dinyatakan bukan seluruh wilayah', /bukan seluruh wilayah/.test(b1.cakupan.keterangan), b1.cakupan.keterangan);
  const b2 = await flights.ambilPenerbangan({
    fetchImpl: f2, sekarang: t0 + flights.CACHE_MS + 1000, paksa: true,
    jedaTitikMs: 0, jedaUlangMs: 0
  });
  cek('penyedia yang gagal dilewati pada permintaan berikutnya',
    f2.catatan.opensky === 1 && b2.ok === true, 'opensky dipanggil ' + f2.catatan.opensky + ' kali');

  console.log('\n[5b] Pembatasan penyedia (429) dijawab dengan percobaan ulang');
  flights._setCache(null); flights._setTunggu({});
  {
    let n = 0;
    const sekali429 = {};
    const f429 = async function (url) {
      if (/opensky-network\.org/.test(url)) {
        const e = new Error('fetch failed');
        e.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
        throw e;
      }
      n++;
      if (n === 3 && !sekali429[n]) {
        sekali429[n] = true;
        const e = new Error('HTTP 429');
        throw e;
      }
      return balasanStub({ ac: [Object.assign({}, PESAWAT_LOL, { hex: 'hex' + n })] });
    };
    const hasil429 = await flights.ambilPenerbangan({
      fetchImpl: f429, sekarang: t0, jedaTitikMs: 0, jedaUlangMs: 0
    });
    cek('429 diulang sekali lalu berhasil', hasil429.ok === true && hasil429.cakupan.titik === 7,
      hasil429.cakupan && hasil429.cakupan.keterangan);
    cek('tidak ada titik yang dilaporkan gagal', (hasil429.cakupan.gagal || []).length === 0);
    cek('titik dipanggil lebih dari jumlah titik (ada percobaan ulang)', n === 8, n + ' panggilan');
    cek('jeda antar titik disetel > 1 detik di produksi', flights.JEDA_TITIK_MS >= 1000,
      flights.JEDA_TITIK_MS + ' ms');
  }

  console.log('\n[6] Kegagalan sebagian titik dilaporkan dengan lokasi');
  flights._setCache(null); flights._setTunggu({});
  {
    let n = 0;
    const fTitik = async function (url) {
      // OpenSky gagal lebih dulu, supaya yang diuji benar-benar jalur
      // penyedia kedua dan penghitungan titik tidak tercampur.
      if (/opensky-network\.org/.test(url)) {
        const e = new Error('fetch failed');
        e.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
        throw e;
      }
      n++;
      if (n === 3 || n === 5) {
        const e = new Error('fetch failed');
        e.cause = { code: 'UND_ERR_CONNECT_TIMEOUT' };
        throw e;
      }
      return balasanStub({ ac: [Object.assign({}, PESAWAT_LOL, { hex: 'hex' + n })] });
    };
    const parsial = await flights.ambilPenerbangan({
      fetchImpl: fTitik, sekarang: t0, jedaTitikMs: 0, jedaUlangMs: 0
    });
    cek('sebagian titik gagal -> hasil tetap ada', parsial.ok === true && parsial.jumlah === 5, parsial.jumlah + ' pesawat');
    cek('jumlah titik yang berhasil disebut', parsial.cakupan.titik === 5, String(parsial.cakupan.titik));
    cek('titik gagal dicatat dengan koordinat',
      Array.isArray(parsial.cakupan.gagal) && parsial.cakupan.gagal.length === 2
      && typeof parsial.cakupan.gagal[0].lat === 'number' && typeof parsial.cakupan.gagal[0].lon === 'number',
      JSON.stringify((parsial.cakupan.gagal || []).map(g => g.lat + ',' + g.lon)));
    const gagal0 = (parsial.cakupan && parsial.cakupan.gagal && parsial.cakupan.gagal[0]) || {};
    cek('sebab kegagalan ikut dicatat', /UND_ERR_CONNECT_TIMEOUT/.test(gagal0.galat || ''), String(gagal0.galat || ''));
    cek('keterangan menyebut koordinat titik gagal', /titik gagal: /.test(parsial.cakupan.keterangan), parsial.cakupan.keterangan);
  }

  console.log('\n[7] Kegagalan sumber tidak menjadi "tidak ada pesawat"');
  flights._setCache(null); flights._setTunggu({});
  const f3 = fetchPalsu({ openskyGagal: true, adsbLolGagal: true });
  const c1 = await flights.ambilPenerbangan({ fetchImpl: f3, sekarang: t0, jedaTitikMs: 0, jedaUlangMs: 0 });
  cek('ok=false saat semua penyedia gagal', c1.ok === false);
  cek('alasan kedua penyedia disertakan', /OpenSky/.test(c1.galat || '') && /adsb\.lol/.test(c1.galat || ''));
  cek('daftar kosong, bukan dikarang', c1.items.length === 0 && c1.jumlah === 0);
  cek('belum ada salinan -> bukan basi', c1.basi === false);

  console.log('\n[8] Salinan lama wajib berlabel basi');
  flights._setCache(null); flights._setTunggu({});
  const f4 = fetchPalsu();
  await flights.ambilPenerbangan({ fetchImpl: f4, sekarang: t0, jedaTitikMs: 0, jedaUlangMs: 0 });
  const f5 = fetchPalsu({ openskyGagal: true, adsbLolGagal: true });
  const basi = await flights.ambilPenerbangan({
    fetchImpl: f5, sekarang: t0 + flights.CACHE_MS + 60000, paksa: true,
    jedaTitikMs: 0, jedaUlangMs: 0
  });
  cek('ok=false saat gagal walau ada salinan', basi.ok === false);
  cek('salinan lama tetap dikirim', basi.items.length === 1);
  cek('ditandai basi', basi.basi === true);
  cek('umur salinan apa adanya', basi.umurMs === flights.CACHE_MS + 60000, String(basi.umurMs));

  console.log('\n[9] Kotak wilayah dan jatah permintaan');
  const k = flights.KOTAK;
  cek('mencakup ujung barat sampai timur', k.lomin <= 95.3 && k.lomax >= 141.0, k.lomin + '..' + k.lomax);
  cek('mencakup ujung utara sampai selatan', k.lamax >= 5.9 && k.lamin <= -10.9, k.lamin + '..' + k.lamax);
  cek('masa cache menjaga jatah harian', flights.CACHE_MS >= 10 * 60 * 1000, flights.CACHE_MS / 60000 + ' menit');
  cek('titik adsb.lol menutup koridor utama', flights.TITIK_ADSB_LOL.length >= 5
    && flights.TITIK_ADSB_LOL.some(p => p.lon > 130) && flights.TITIK_ADSB_LOL.some(p => p.lon < 105),
    flights.TITIK_ADSB_LOL.length + ' titik');

  console.log('\n[10] Sambungan antarmuka dan rute');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public/app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  cek('sakelar lapisan ada', html.includes('id="lyFlights"') && html.includes('id="fltMeta"'));
  cek('grup lapisan terpisah', /var gFlights = L\.layerGroup\(\)/.test(js));
  cek('rute /api/flights ada', server.includes("app.get('/api/flights'"));
  cek('lapisan ikut keadaan kotak centang saat dimuat', /if \(state\.flightsOn\) loadFlights\(\);/.test(js));
  cek('penyegaran hanya saat lapisan menyala',
    /if \(state\.flightsOn\) loadFlights\(\); \}, 5 \* 60 \* 1000\)/.test(js));
  cek('kegagalan tidak digambar sebagai ketiadaan pesawat',
    js.includes('Sumber lalu lintas udara tidak tersedia ('));
  cek('penyedia disebut di keterangan', js.includes("d.penyedia"));
  cek('cakupan disebut di keterangan', js.includes('d.cakupan') || js.includes('cakupan'));
  // Yang diuji adalah TIDAK ADANYA lapisan itu, bukan tidak adanya kata di
  // penjelasan. Justru penjelasannya yang menyatakan batas ini secara terbuka.
  cek('tidak ada sakelar lapisan militer/privat', !/id="ly(Military|Private|Jets)/.test(html));
  cek('batas dinyatakan terbuka di panel Sumber',
    html.includes('Tidak ada lapisan militer maupun jet pribadi'));
  cek('keterangan menyebut keterbatasan cakupan ADS-B',
    js.includes('jaringan penerima tidak rapat') && html.includes('Jaringan penerima tidak rapat'));

  console.log('\n' + '='.repeat(46));
  console.log('  ' + lulus + ' lulus, ' + gagal + ' gagal');
  console.log('='.repeat(46));
  process.exit(gagal ? 1 : 0);
})();
