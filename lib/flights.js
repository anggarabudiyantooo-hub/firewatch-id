'use strict';

/**
 * Lalu lintas udara sipil di atas Indonesia, dari OpenSky Network.
 *
 * Alasan lapisan ini ada di dasbor bencana: abu vulkanik adalah bahaya
 * penerbangan, dan NOTAM penutupan ruang udara hanya masuk akal bila
 * terlihat bersama posisi pesawat. Jadi lapisan ini bukan pelengkap gaya,
 * melainkan konteks untuk keputusan yang sudah ada di dasbor ini.
 *
 * Aturan yang dipegang modul ini:
 *
 *   1. Yang ditampilkan adalah pesawat yang TERPANCAAR ke penerima darat
 *      (ADS-B). Jaringan penerima tidak rapat, jadi ketiadaan pesawat di
 *      satu kotak bukan bukti tidak ada penerbangan. Itu ditulis di UI.
 *   2. Tidak ada lapisan khusus militer atau jet pribadi. Selain data itu
 *      tidak lengkap di sumber publik, memetakan pesawat tertentu bukan
 *      urusan dasbor bencana.
 *   3. Sumbernya punya jatah permintaan harian, jadi hasilnya di-cache di
 *      dalam proses. Umur data selalu ikut dilaporkan, tidak disembunyikan.
 *   4. Bila sumber gagal, yang dilaporkan adalah kegagalan itu. Salinan
 *      lama boleh dipakai, tetapi harus berlabel basi, bukan disajikan
 *      seolah baru.
 */

const SUMBER = 'OpenSky Network (data publik ADS-B)';
const URL_STATES = 'https://opensky-network.org/api/states/all';
// Kotak Indonesia, sedikit dilebihkan supaya pesawat di perbatasan ikut
// terlihat: 94,5 BT sampai 141,5 BT dan 11,5 LS sampai 6,5 LU.
const KOTAK = { lamin: -11.5, lomin: 94.5, lamax: 6.5, lomax: 141.5 };
// Jatah anonim OpenSky sekitar 400 kredit/hari dan satu permintaan kotak
// berbiaya 4 kredit, jadi 15 menit adalah batas aman (maks 96 permintaan).
const CACHE_MS = 15 * 60 * 1000;

let cache = null; // { diambilAt, items }

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

/** Satu baris state OpenSky -> objek yang bisa dipakai UI, atau null. */
function normalisasiBaris(s) {
  if (!Array.isArray(s) || s.length < 11) return null;
  const lat = angka(s[6]);
  const lon = angka(s[5]);
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  const callsignRaw = String(s[1] == null ? '' : s[1]).trim();
  const altGeo = angka(s[13]);         // ketinggian geodetik (m)
  const altBaro = angka(s[7]);         // ketinggian barometrik (m)
  const kec = angka(s[9]);             // m/s
  const arah = angka(s[10]);
  const kontak = angka(s[4]);
  return {
    icao: String(s[0] || ''),
    callsign: callsignRaw || null,
    negara: String(s[2] || '') || null,
    lon: lon,
    lat: lat,
    // Didahulukan ketinggian geodetik; barometrik dipakai bila kosong,
    // dan bila keduanya kosong ditulis null, bukan nol.
    altM: altGeo !== null ? Math.round(altGeo)
      : (altBaro !== null ? Math.round(altBaro) : null),
    kecepatanMs: kec,
    arahDeg: arah,
    diDarat: s[8] === true,
    terakhirKontak: kontak !== null ? new Date(kontak * 1000).toISOString() : null
  };
}

/** Seluruh payload OpenSky -> daftar ternormalisasi. */
function normalisasi(payload) {
  const states = (payload && payload.states) || [];
  const out = [];
  for (const s of states) {
    const item = normalisasiBaris(s);
    if (item) out.push(item);
  }
  return out;
}

/**
 * Ambil lalu lintas udara dengan cache dalam proses.
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

  if (!paksa && cache && (sekarang - cache.diambilAt) < CACHE_MS) {
    return hasil(cache.items, cache.diambilAt, sekarang, { dariCache: true });
  }
  if (!fetchImpl) {
    return hasil(cache ? cache.items : [], cache ? cache.diambilAt : null, sekarang, {
      galat: 'pengambil data tidak tersedia di lingkungan ini'
    });
  }

  const url = URL_STATES + '?lamin=' + KOTAK.lamin + '&lomin=' + KOTAK.lomin
    + '&lamax=' + KOTAK.lamax + '&lomax=' + KOTAK.lomax;
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'SiagaID/1.0', Accept: 'application/json' } });
    if (!res || !res.ok) {
      throw new Error('HTTP ' + ((res && res.status) || 'tidak diketahui'));
    }
    const bersih = normalisasi(await res.json());
    cache = { diambilAt: sekarang, items: bersih };
    return hasil(bersih, sekarang, sekarang, { dariCache: false });
  } catch (err) {
    // Sumber gagal. Bila masih ada salinan lama, salinan itu boleh dipakai
    // tetapi WAJIB berlabel basi; bila tidak ada, hasilnya kosong dan alasannya
    // ditulis apa adanya.
    return hasil(cache ? cache.items : [], cache ? cache.diambilAt : null, sekarang, {
      galat: (err && err.message) || 'sumber tidak dapat dihubungi'
    });
  }
}

function hasil(items, diambilAt, sekarang, opsi) {
  const umurMs = diambilAt ? Math.max(0, sekarang - diambilAt) : null;
  return {
    ok: !opsi.galat,
    sumber: SUMBER,
    kotak: KOTAK,
    items: items,
    jumlah: items.length,
    diambilAt: diambilAt ? new Date(diambilAt).toISOString() : null,
    umurMs: umurMs,
    basi: opsi.galat ? umurMs !== null : false,
    galat: opsi.galat || null,
    dariCache: opsi.dariCache === true,
    cacheMs: CACHE_MS
  };
}

module.exports = {
  SUMBER,
  KOTAK,
  CACHE_MS,
  normalisasi,
  normalisasiBaris,
  ambilPenerbangan,
  _setCache: function (isi) { cache = isi; } // hanya untuk uji
};
