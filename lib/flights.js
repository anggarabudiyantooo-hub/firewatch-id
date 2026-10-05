'use strict';

/**
 * Lalu lintas udara sipil di atas Indonesia, dari jaringan ADS-B publik.
 *
 * Alasan lapisan ini ada di dasbor bencana: abu vulkanik adalah bahaya
 * penerbangan, dan posisi pesawat membuat penutupan ruang udara bisa dibaca
 * pada konteksnya. Lapisan ini bukan pelengkap gaya.
 *
 * Aturan yang dipegang modul ini:
 *
 *   1. Yang ditampilkan adalah pesawat yang TERPANCAAR ke penerima darat
 *      (ADS-B). Jaringan penerima tidak rapat, jadi ketiadaan pesawat di
 *      satu wilayah bukan bukti tidak ada penerbangan. Itu ditulis di UI.
 *   2. Tidak ada lapisan militer atau jet pribadi. Selain data itu tidak
 *      lengkap di sumber publik, memetakan pesawat tertentu bukan urusan
 *      dasbor bencana.
 *   3. Sumber punya jatah permintaan, jadi hasilnya di-cache dan umur data
 *      selalu ikut dilaporkan.
 *   4. Kegagalan sumber dilaporkan sebagai kegagalan. Salinan lama boleh
 *      dipakai, tetapi wajib berlabel basi.
 *   5. Dua penyedia dipakai berurutan. Yang gagal masuk masa tunggu supaya
 *      permintaan berikutnya tidak membuang waktu pada sumber yang sedang
 *      tidak dapat dijangkau dari lingkungan produksi (hal yang terukur:
 *      OpenSky dapat dihubungi dari jaringan pengembang, tetapi dari Vercel
 *      koneksinya timeout, sehingga adsb.lol dipakai sebagai penyedia kedua).
 */

// ---------- Penyedia 1: OpenSky Network (satu permintaan, seluruh kotak) ----------
const OPEN_SKY = {
  id: 'opensky',
  nama: 'OpenSky Network',
  keterangan: 'satu permintaan untuk seluruh kotak Indonesia',
  // Kotak Indonesia, sedikit dilebihkan supaya pesawat di perbatasan ikut
  // terlihat: 94,5 BT sampai 141,5 BT dan 11,5 LS sampai 6,5 LU.
  kotak: { lamin: -11.5, lomin: 94.5, lamax: 6.5, lomax: 141.5 },
  url: function () {
    const k = this.kotak;
    return 'https://opensky-network.org/api/states/all?lamin=' + k.lamin
      + '&lomin=' + k.lomin + '&lamax=' + k.lamax + '&lomax=' + k.lomax;
  },
  normalisasi: function (payload) {
    const states = (payload && payload.states) || [];
    const out = [];
    for (const s of states) {
      const item = barisOpenSky(s);
      if (item) out.push(item);
    }
    return { items: out, cakupan: { mode: 'kotak', keterangan: 'seluruh kotak Indonesia' } };
  }
};

// ---------- Penyedia 2: adsb.lol (gabungan beberapa titik radius) ----------
// Radius 400 nm sekitar 740 km; titik-titik di bawah menutup koridor udara
// utama: Sumatra, Jawa, Kalimantan, Sulawesi, Nusa Tenggara, dan Papua.
// Urutan penting. Dari produksi, pembatasan laju adsb.lol membuat sebagian
// titik gagal; karena titik diambil berurutan, yang paling padat penerbangan
// diambil lebih dulu. Bila jatah habis di tengah jalan, yang hilang adalah
// koridor paling sepi, bukan koridor Jakarta-Surabaya.
const TITIK_ADSB_LOL = [
  { lat: -6.5, lon: 107.5 },  // Jawa bagian barat (Jakarta, Bandung)
  { lat: -7.8, lon: 112.5 },  // Jawa bagian timur (Surabaya, Malang)
  { lat: -3.0, lon: 102.5 },  // Sumatra bagian selatan
  { lat: -2.0, lon: 121.0 },  // Sulawesi
  { lat: -0.5, lon: 114.0 },  // Kalimantan
  { lat: 2.5, lon: 99.0 },    // Sumatra bagian utara
  { lat: -4.0, lon: 138.0 }   // Papua
];
// Terukur dari produksi: tujuh permintaan beruntun dari satu alamat IP
// membuat adsb.lol membalas HTTP 429 pada dua titik terakhir. Titik diambil
// berurutan dengan jeda, bukan serentak, supaya jatah penyedia tidak
// terpicu. Jeda ini hanya terasa pada pengambilan pertama; sesudahnya
// jawaban dilayani cache 15 menit.
const JEDA_TITIK_MS = 1100;
// Satu percobaan ulang setelah jeda lebih panjang bila penyedia membalas 429.
const JEDA_ULANG_MS = 2000;

const ADSB_LOL = {
  id: 'adsblol',
  nama: 'adsb.lol',
  keterangan: 'gabungan ' + TITIK_ADSB_LOL.length + ' titik radius 400 nm',
  radiusNm: 400,
  titik: TITIK_ADSB_LOL,
  url: function (titik) {
    return 'https://api.adsb.lol/v2/point/' + titik.lat + '/' + titik.lon + '/' + this.radiusNm;
  },
  normalisasi: function (payload) {
    const ac = (payload && payload.ac) || [];
    const out = new Map();
    for (const a of ac) {
      const item = barisAdsbLol(a);
      // Satu pesawat dapat terlihat oleh dua titik sekaligus; kunci icao24
      // mencegah penanda ganda di peta.
      if (item) out.set(item.icao, item);
    }
    return {
      items: Array.from(out.values()),
      cakupan: {
        mode: 'titik',
        titik: TITIK_ADSB_LOL.length,
        radiusNm: ADSB_LOL.radiusNm,
        keterangan: TITIK_ADSB_LOL.length + ' titik radius ' + ADSB_LOL.radiusNm + ' nm (bukan seluruh wilayah)'
      }
    };
  }
};

// ---------- Penyedia 2: snapshot dari penjadwal luar ----------
// Terukur: dari fungsi produksi Vercel, OpenSky tidak dapat dijangkau, tetapi
// dari runner GitHub alamat yang sama menjawab 200 dengan lebih dari 170
// pesawat. Karena itu penjadwal luar (GitHub Actions) mengambil snapshot
// seluruh kotak Indonesia tiap 15 menit dan menaruhnya di cabang
// `snapshot-flights`. Aplikasi cukup membaca berkas statis itu; tidak ada
// koneksi langsung dari produksi ke penyedia data.
//
// Snapshot yang terlalu tua tidak dipakai: lebih baik kehilangan cakupan
// daripada menyajikan langit yang sudah berubah sebagai keadaan sekarang.
//
// Catatan penyajian: berkas di cabang itu disajikan lewat CDN GitHub dengan
// masa simpan lima menit (cache-control max-age=300, terukur), jadi salinan
// yang terbaca bisa tertinggal beberapa menit dari isi cabang. Umur yang
// dilaporkan tetap umur data di dalam berkas, bukan umur unduhan.
const SNAPSHOT_URL = 'https://raw.githubusercontent.com/anggarabudiyantooo-hub/'
  + 'firewatch-id/snapshot-flights/snapshot/flights.json';
const KESEGARAN_MAKS_MS = 45 * 60 * 1000;

const SNAPSHOT = {
  id: 'snapshot',
  nama: 'snapshot penjadwal luar',
  keterangan: 'cabang snapshot-flights, penjadwal luar tiap 15 menit',
  url: function () { return SNAPSHOT_URL; },
  normalisasi: function (payload) {
    if (!payload || !Array.isArray(payload.items)) throw new Error('snapshot tanpa daftar pesawat');
    const diambilAt = Date.parse(payload.diambilAt);
    if (!Number.isFinite(diambilAt)) throw new Error('snapshot tanpa waktu pengambilan');
    const items = [];
    for (const it of payload.items) {
      if (!it || typeof it !== 'object') continue;
      const lat = angka(it.lat);
      const lon = angka(it.lon);
      if (lat === null || lon === null) continue;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
      items.push({
        icao: String(it.icao || ''),
        callsign: it.callsign ? String(it.callsign) : null,
        negara: it.negara ? String(it.negara) : null,
        lon: lon,
        lat: lat,
        altM: angka(it.altM),
        kecepatanMs: angka(it.kecepatanMs),
        arahDeg: angka(it.arahDeg),
        diDarat: it.diDarat === true,
        terakhirKontak: it.terakhirKontak || null
      });
    }
    // Snapshot kosong diperlakukan sebagai kegagalan, bukan sebagai kabar
    // "tidak ada pesawat". Jaringan penerima yang sedang sepi tetap mungkin
    // menghasilkan puluhan pesawat di kotak seluas Indonesia, jadi nol berarti
    // pengambilan di sisi penjadwal gagal.
    if (!items.length) throw new Error('snapshot kosong, dianggap gagal');
    return {
      items: items,
      diambilAt: diambilAt,
      // Sumber asli datanya ikut dibawa. Tanpa ini, keterangan hanya bisa
      // menyebut "penjadwal luar" dan pembaca tidak tahu datanya dari mana.
      sumberAsal: payload.penyedia || null,
      cakupan: {
        mode: 'kotak',
        keterangan: 'snapshot kotak Indonesia oleh penjadwal luar'
          + (payload.penyedia ? ' (' + payload.penyedia + ')' : '')
      }
    };
  }
};

// Urutan percobaan: OpenSky langsung, lalu snapshot penjadwal luar, lalu
// adsb.lol. Snapshot didahulukan atas adsb.lol karena cakupannya satu kotak
// penuh dan umurnya sudah diketahui; adsb.lol tetap ada sebagai jalur hidup
// bila penjadwal luar sedang tidak berjalan.
const PENYEDIA = [OPEN_SKY, SNAPSHOT, ADSB_LOL];
const SUMBER = 'ADS-B publik (OpenSky Network atau adsb.lol)';
const TIMEOUT_MS = 6000;
// Jatah: OpenSky anonim sekitar 400 kredit/hari dan satu permintaan kotak
// berbiaya 4 kredit. 15 menit menjaga pemakaian jauh di bawah jatah itu.
const CACHE_MS = 15 * 60 * 1000;
// Penyedia yang gagal tidak dicoba lagi selama masa tunggu ini, supaya
// pengguna tidak menunggu koneksi yang sedang tidak dapat dijangkau.
const TUNGGU_MS = 30 * 60 * 1000;

let cache = null;       // { diambilAt, items, penyedia, cakupan }
let tungguSampai = {};  // id penyedia -> waktu (ms) sampai kapan dilewati

/**
 * Angka dari payload, atau null.
 *
 * Number(null) bernilai 0 dan Number('') juga 0. Tanpa penjaga ini, kolom
 * kosong berubah menjadi nol yang sah: pesawat tanpa posisi akan muncul di
 * koordinat 0,0 (Teluk Guinea) dan ketinggian kosong akan terbaca 0 m.
 * Untuk dasbor bencana, angka karangan seperti itu lebih buruk daripada
 * kolom yang ditulis "tidak terukur".
 */
function angka(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const KAKI_KE_METER = 0.3048;
const KNOT_KE_MS = 0.514444;
const NM_KE_KM = 1.852;

/** Satu baris state OpenSky -> objek yang bisa dipakai UI, atau null. */
function barisOpenSky(s) {
  if (!Array.isArray(s) || s.length < 11) return null;
  const lat = angka(s[6]);
  const lon = angka(s[5]);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const callsignRaw = String(s[1] == null ? '' : s[1]).trim();
  const altGeo = angka(s[13]);         // ketinggian geodetik (m)
  const altBaro = angka(s[7]);         // ketinggian barometrik (m)
  return {
    icao: String(s[0] || ''),
    callsign: callsignRaw || null,
    negara: String(s[2] || '') || null,
    lon: lon,
    lat: lat,
    // Didahulukan ketinggian geodetik; barometrik dipakai bila kosong, dan
    // bila keduanya kosong ditulis null, bukan nol.
    altM: altGeo !== null ? Math.round(altGeo)
      : (altBaro !== null ? Math.round(altBaro) : null),
    kecepatanMs: angka(s[9]),
    arahDeg: angka(s[10]),
    diDarat: s[8] === true,
    terakhirKontak: (function () {
      const t = angka(s[4]);
      return t !== null ? new Date(t * 1000).toISOString() : null;
    })()
  };
}

/**
 * Satu objek pesawat adsb.lol -> objek dengan bentuk yang sama.
 * Sumber ini memakai kaki dan knot, jadi satuannya ditukar di sini, bukan
 * di antarmuka: kalau penukaran terjadi di dua tempat, keduanya bisa
 * berbeda tanpa ada yang sadar.
 */
function barisAdsbLol(a) {
  if (!a || typeof a !== 'object') return null;
  const lat = angka(a.lat);
  const lon = angka(a.lon);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const diDarat = a.alt_baro === 'ground' || a.ground === true;
  const altKaki = angka(a.alt_geom) !== null ? angka(a.alt_geom) : angka(a.alt_baro);
  const gs = angka(a.gs);
  const track = angka(a.track);
  const t = angka(a.t);
  const callsign = String(a.flight == null ? '' : a.flight).trim();
  return {
    icao: String(a.hex || ''),
    callsign: callsign || null,
    // adsb.lol tidak mengirim negara pendaftaran. Dibiarkan null; menebak
    // dari awalan registrasi akan menghasilkan klaim yang tidak terukur.
    negara: null,
    lon: lon,
    lat: lat,
    altM: diDarat ? null : (altKaki !== null ? Math.round(altKaki * KAKI_KE_METER) : null),
    kecepatanMs: gs !== null ? gs * KNOT_KE_MS : null,
    arahDeg: track,
    diDarat: diDarat,
    terakhirKontak: t !== null ? new Date(t * 1000).toISOString() : null
  };
}

function tidur(ms) {
  if (!ms) return Promise.resolve();
  return new Promise(function (selesai) { setTimeout(selesai, ms); });
}

/** "fetch failed" + sebab jaringan sedetail yang tersedia. */
function rincianGalat(err) {
  if (!err) return 'sumber tidak dapat dihubungi';
  const sebab = err.cause || {};
  const kode = sebab.code || err.code || null;
  let pesan = err.name === 'AbortError'
    ? 'batas waktu ' + (TIMEOUT_MS / 1000) + ' detik terlampaui'
    : (err.message || 'sumber tidak dapat dihubungi');
  if (kode) pesan += ' (' + kode + ')';
  if (sebab.message && sebab.message !== pesan) pesan += ' - ' + String(sebab.message).slice(0, 140);
  return pesan;
}

async function ambilDenganBatas(fetchImpl, url, ms) {
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, ms);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'SiagaID/1.0', Accept: 'application/json' },
      signal: ac.signal
    });
    if (!res || !res.ok) throw new Error('HTTP ' + ((res && res.status) || 'tidak diketahui'));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Ambil dari satu penyedia. Melempar bila penyedia ini gagal. */
async function dariPenyedia(pr, fetchImpl, opsi) {
  const jedaTitik = opsi.jedaTitikMs === undefined ? JEDA_TITIK_MS : opsi.jedaTitikMs;
  const jedaUlang = opsi.jedaUlangMs === undefined ? JEDA_ULANG_MS : opsi.jedaUlangMs;
  if (pr.id === 'snapshot') {
    const payload = await ambilDenganBatas(fetchImpl, pr.url(), TIMEOUT_MS);
    const data = pr.normalisasi(payload);
    const umur = opsi.sekarang - data.diambilAt;
    if (umur > KESEGARAN_MAKS_MS) {
      throw new Error('snapshot berumur ' + Math.round(umur / 60000) + ' menit, batas '
        + Math.round(KESEGARAN_MAKS_MS / 60000) + ' menit');
    }
    return data;
  }
  if (pr.id === 'adsblol') {
    // Beberapa titik digabung; satu titik gagal tidak membatalkan seluruh
    // hasil, tetapi jumlah titik yang gagal dilaporkan supaya cakupan tidak
    // dilebihkan. Bila SEMUA titik gagal, penyedia ini dianggap gagal.
    const items = new Map();
    const gagal = [];
    let galatPertama = null;
    // Berurutan dengan jeda; pembatasan 429 dari penyedia bukan kegagalan
    // jaringan, dan menunggu sebentar jauh lebih murah daripada kehilangan
    // satu titik cakupan.
    for (let i = 0; i < pr.titik.length; i++) {
      const titik = pr.titik[i];
      try {
        if (i > 0) await tidur(jedaTitik);
        let payload;
        try {
          payload = await ambilDenganBatas(fetchImpl, pr.url(titik), TIMEOUT_MS);
        } catch (err) {
          if (!/HTTP 429/.test(err.message || '')) throw err;
          // Satu percobaan ulang. Bila 429 datang lagi, jatah penyedia
          // memang habis: meneruskan ke titik berikutnya hanya membuang
          // waktu dan menambah beban, jadi sisanya dilewati dan dilaporkan.
          await tidur(jedaUlang);
          try {
            payload = await ambilDenganBatas(fetchImpl, pr.url(titik), TIMEOUT_MS);
          } catch (err2) {
            if (/HTTP 429/.test(err2.message || '')) {
              gagal.push({ lat: titik.lat, lon: titik.lon, galat: 'dilewati: pembatasan laju penyedia (HTTP 429)' });
              for (let j = i + 1; j < pr.titik.length; j++) {
                gagal.push({
                  lat: pr.titik[j].lat, lon: pr.titik[j].lon,
                  galat: 'dilewati: pembatasan laju penyedia (HTTP 429)'
                });
              }
              break;
            }
            throw err2;
          }
        }
        const bagian = pr.normalisasi(payload).items;
        bagian.forEach(function (p) { items.set(p.icao, p); });
      } catch (err) {
        // Titik yang gagal dicatat lengkap, termasuk koordinatnya. Cakupan
        // yang bocor harus bisa ditunjuk lokasinya, bukan hanya dihitung.
        gagal.push({ lat: titik.lat, lon: titik.lon, galat: rincianGalat(err) });
        if (!galatPertama) galatPertama = err;
      }
    }
    if (gagal.length === pr.titik.length) throw galatPertama || new Error('semua titik gagal');
    const jumlahTitik = pr.titik.length - gagal.length;
    return {
      items: Array.from(items.values()),
      cakupan: {
        mode: 'titik',
        titik: jumlahTitik,
        radiusNm: pr.radiusNm,
        gagal: gagal,
        keterangan: jumlahTitik + ' dari ' + pr.titik.length
          + ' titik radius ' + pr.radiusNm + ' nm (bukan seluruh wilayah)'
          + (gagal.length ? ', ' + gagal.length + ' titik gagal: '
            + gagal.map(function (g) { return g.lat + ',' + g.lon; }).join('; ') : '')
      }
    };
  }
  const payload = await ambilDenganBatas(fetchImpl, pr.url(), TIMEOUT_MS);
  return pr.normalisasi(payload);
}

/**
 * Ambil lalu lintas udara dengan cache dalam proses, mencoba penyedia
 * berurutan: OpenSky dulu (satu permintaan, cakupan penuh), lalu adsb.lol.
 *
 * @param {object} opsi
 *   - fetchImpl: fungsi fetch pengganti (dipakai uji, tanpa jaringan)
 *   - sekarang : waktu sekarang (ms) pengganti, untuk uji kedaluwarsa
 *   - paksa    : abaikan cache
 */
async function ambilPenerbangan(opsi = {}) {
  const fetchImpl = opsi.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const sekarang = typeof opsi.sekarang === 'number' ? opsi.sekarang : Date.now();
  const paksa = opsi.paksa === true;

  // Umur cache dihitung dari waktu pengambilan BERKAS, sedangkan umur data
  // yang ditampilkan dihitung dari waktu pengambilan DATA. Kalau keduanya
  // disamakan, snapshot yang sudah berumur 20 menit akan dianggap kedaluwarsa
  // sejak detik pertama dan berkasnya diunduh ulang pada setiap permintaan.
  const cacheSejak = cache ? (cache.diambilAtLokal || cache.diambilAt) : null;
  if (!paksa && cache && (sekarang - cacheSejak) < CACHE_MS) {
    return hasil(cache.items, cache, sekarang, { dariCache: true });
  }
  if (!fetchImpl) {
    return hasil(cache ? cache.items : [], cache, sekarang, {
      galat: 'pengambil data tidak tersedia di lingkungan ini'
    });
  }

  const catatanGagal = [];
  for (const pr of PENYEDIA) {
    // Penjadwal luar memakai modul ini juga; ia harus mengambil dari
    // penyedia data, bukan membaca snapshot yang ia sendiri tulis.
    if (opsi.tanpaSnapshot && pr.id === 'snapshot') continue;
    const sampai = tungguSampai[pr.id];
    if (sampai && sekarang < sampai) {
      catatanGagal.push(pr.nama + ': dilewati sementara sampai ' + Math.ceil((sampai - sekarang) / 60000) + ' menit lagi');
      continue;
    }
    try {
      const data = await dariPenyedia(pr, fetchImpl, opsi);
      cache = {
        // Snapshot membawa waktu pengambilannya sendiri; umur yang
        // ditampilkan harus umur datanya, bukan umur berkas diunduh.
        diambilAt: data.diambilAt || sekarang,
        diambilAtLokal: sekarang,
        items: data.items,
        penyedia: pr.nama,
        penyediaId: pr.id,
        sumberAsal: data.sumberAsal || null,
        keterangan: pr.keterangan,
        cakupan: data.cakupan
      };
      delete tungguSampai[pr.id];
      return hasil(data.items, cache, sekarang, { dariCache: false });
    } catch (err) {
      tungguSampai[pr.id] = sekarang + TUNGGU_MS;
      catatanGagal.push(pr.nama + ': ' + rincianGalat(err));
    }
  }

  return hasil(cache ? cache.items : [], cache, sekarang, {
    galat: catatanGagal.join(' | ') || 'sumber tidak dapat dihubungi'
  });
}

function hasil(items, sumberCache, sekarang, opsi) {
  const diambilAt = sumberCache ? sumberCache.diambilAt : null;
  const umurMs = diambilAt ? Math.max(0, sekarang - diambilAt) : null;
  return {
    ok: !opsi.galat,
    sumber: SUMBER,
    penyedia: sumberCache ? sumberCache.penyedia || null : null,
    sumberAsal: sumberCache ? sumberCache.sumberAsal || null : null,
    cakupan: sumberCache ? sumberCache.cakupan || null : null,
    items: items,
    jumlah: items.length,
    diambilAt: diambilAt ? new Date(diambilAt).toISOString() : null,
    umurMs: umurMs,
    basi: opsi.galat ? umurMs !== null : false,
    galat: opsi.galat || null,
    dariCache: opsi.dariCache === true,
    cacheMs: CACHE_MS,
    tungguMs: TUNGGU_MS
  };
}

module.exports = {
  SUMBER,
  PENYEDIA,
  TITIK_ADSB_LOL,
  CACHE_MS,
  TUNGGU_MS,
  JEDA_TITIK_MS,
  SNAPSHOT_URL,
  KESEGARAN_MAKS_MS,
  JEDA_ULANG_MS,
  KOTAK: OPEN_SKY.kotak,
  normalisasi: function (payload) { return OPEN_SKY.normalisasi(payload).items; },
  normalisasiBaris: barisOpenSky,
  normalisasiAdsbLol: barisAdsbLol,
  ambilPenerbangan,
  _setCache: function (isi) { cache = isi; },
  _setTunggu: function (isi) { tungguSampai = isi || {}; }
};
