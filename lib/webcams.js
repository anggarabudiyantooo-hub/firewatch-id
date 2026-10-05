'use strict';

/**
 * Kamera web komunitas dari Windy (Windy Webcams API v3, pengganti
 * webcams.travel).
 *
 * Kenapa modul ini ada padahal lapisan Siaran sudah memuat kanal YouTube:
 * kanal YouTube menampilkan gunung api dari beberapa titik resmi, sedangkan
 * kamera komunitas Windy menutup jalan, pelabuhan, dan pantai di kota-kota
 * yang tidak punya kamera resmi. Untuk konteks bencana, itu bedanya antara
 * "gunungnya terlihat" dan "kotanya terlihat".
 *
 * TIGA HAL YANG HARUS DIBACA SEBELUM MENGUBAH MODUL INI
 *
 * 1. Windy TIDAK menyediakan daftar kamera tanpa kunci. Diukur langsung ke
 *    api.windy.com/webcams/api/v3/webcams tanpa header, balasannya:
 *      HTTP 403 {"message":"Missing Header 'x-windy-api-key' with API key"}
 *    Halaman windy.com bisa menampilkan kamera karena aplikasi mereka
 *    memanggil API itu dengan kunci milik mereka sendiri. Kunci itu bukan
 *    milik kita dan tidak boleh dipakai di sini, jadi satu-satunya jalan
 *    yang sah adalah kunci kita sendiri.
 *
 * 2. Kunci diambil dari env `WINDY_WEBCAMS_KEY` dan HANYA dipakai di server.
 *    Tanpa kunci, modul ini TIDAK menghubungi jaringan sama sekali dan
 *    melaporkan keadaannya apa adanya supaya antarmuka bisa menuliskannya.
 *    Kunci tidak pernah dikirim ke peramban.
 *
 * 3. Windy mensyaratkan atribusi dan membatasi pemakaian gratis untuk
 *    non-komersial. Karena itu setiap kartu menyebut sumbernya, dan jumlah
 *    permintaan dijaga oleh cache 30 menit.
 */

const SUMBER = 'Windy Webcams API v3 (Windy.com)';
const URL_DAFTAR = 'https://api.windy.com/webcams/api/v3/webcams';
const ATRIBUSI = 'Windy.com';
const CACHE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 10000;
// Batas resmi endpoint: limit 0-50. Sisanya lewat halaman berikutnya, dan
// halaman berikutnya hanya diambil bila pengguna memang memintanya.
const LIMIT_MAKS = 50;
const NEGARA = 'ID';
const TINGKAT_GRATIS_PER_HARI = 1000;

let cache = null;

function kunci() {
  const k = process.env.WINDY_WEBCAMS_KEY || process.env.WINDY_API_KEY || '';
  return String(k).trim();
}

/** Keadaan sumber, tanpa menghubungi jaringan. */
function keadaan() {
  const ada = kunci() !== '';
  return {
    aktif: ada,
    sumber: SUMBER,
    negara: NEGARA,
    atribusi: ATRIBUSI,
    cacheMs: CACHE_MS,
    batasGratisPerHari: TINGKAT_GRATIS_PER_HARI,
    sebab: ada ? null
      : 'kunci API Windy belum dipasang. Windy tidak mengizinkan pendaftaran kamera tanpa kunci: '
        + 'api.windy.com menjawab 403 "Missing Header x-windy-api-key" bila kuncinya tidak ada. '
        + 'Pasang env WINDY_WEBCAMS_KEY lalu deploy ulang, dan daftarnya akan terisi sendiri.',
    caraPasang: 'Vercel: Project, Settings, Environment Variables, WINDY_WEBCAMS_KEY, '
      + 'lalu redeploy. Kunci gratis untuk pemakaian non-komersial dari api.windy.com.'
  };
}

function angka(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Satu kamera dari balasan API -> bentuk yang dipakai antarmuka.
 *
 * Bidang yang tidak dikirim sumber dibiarkan null. Kamera tanpa koordinat
 * tetap boleh tampil sebagai kartu, tetapi tidak akan dipetakan; mengarang
 * koordinat untuk kamera yang berpindah tempat akan menyesatkan.
 */
function normalizeWebcam(w) {
  if (!w || typeof w !== 'object') return null;
  const id = w.webcamId !== undefined && w.webcamId !== null ? String(w.webcamId) : null;
  if (!id) return null;
  const lok = w.location || {};
  const gambar = w.images || {};
  const kini = gambar.current || {};
  const url = w.urls || {};
  const judul = String(
    w.title || (lok.city ? 'Kamera ' + lok.city : '') || 'Kamera tanpa judul'
  ).trim();
  return {
    id: id,
    judul: judul,
    kota: lok.city ? String(lok.city) : null,
    wilayah: lok.region ? String(lok.region) : null,
    negara: lok.country ? String(lok.country) : null,
    lat: angka(lok.latitude),
    lon: angka(lok.longitude),
    // Thumbnail diambil server lalu dialirkan ulang, jadi alamat aslinya
    // tidak perlu dibuka di daftar Content-Security-Policy.
    adaFoto: Boolean(kini.preview || kini.thumbnail),
    // Alamat gambar tetap di server: dipakai rute /api/webcams/foto untuk
    // mengalirkan thumbnail, dan TIDAK ikut dikirim ke peramban.
    _fotoUrl: kini.preview ? String(kini.preview)
      : (kini.thumbnail ? String(kini.thumbnail) : null),
    waktuFoto: (function () {
      const t = kini.update !== undefined ? kini.update
        : (kini.inserted !== undefined ? kini.inserted : null);
      const n = angka(t);
      if (n === null) return null;
      const ms = n > 1e12 ? n : n * 1000;
      const d = new Date(ms);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    })(),
    tautan: url.detail ? String(url.detail) : ('https://www.windy.com/webcams/' + id)
  };
}

/** Query daftar kamera untuk Indonesia. */
function urlDaftar(opsi) {
  const limit = Math.min(LIMIT_MAKS, Math.max(1, Number(opsi.limit) || LIMIT_MAKS));
  const offset = Math.max(0, Number(opsi.offset) || 0);
  const p = new URLSearchParams();
  p.set('countries', NEGARA);
  // Filtrer negara dipakai, bukan kotak koordinat: kotak Windy dibatasi
  // tingkat pembesaran (pada tingkat 4 hanya boleh 22,5 derajat lintang),
  // sedangkan Indonesia membentang 47 derajat bujur.
  p.set('limit', String(limit));
  p.set('offset', String(offset));
  p.set('include', 'location,images,urls');
  p.set('lang', 'id');
  return URL_DAFTAR + '?' + p.toString();
}

async function ambilDenganBatas(fetchImpl, url, ms, opsi) {
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, ms);
  try {
    const res = await fetchImpl(url, {
      headers: {
        'x-windy-api-key': kunci(),
        Accept: 'application/json',
        'User-Agent': 'SiagaID/1.0'
      },
      signal: ac.signal
    });
    if (!res || !res.ok) throw new Error('HTTP ' + ((res && res.status) || 'tidak diketahui'));
    return opsi && opsi.mentah ? res : await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ambil daftar kamera. Tanpa kunci: satu balasan jujur, tanpa jaringan.
 *
 * @param {object} opsi
 *   - fetchImpl : pengganti fetch (dipakai uji, tanpa jaringan)
 *   - sekarang  : waktu sekarang (ms) pengganti
 *   - paksa     : abaikan cache
 */
async function ambilWebcam(opsi = {}) {
  const sekarang = typeof opsi.sekarang === 'number' ? opsi.sekarang : Date.now();
  const kead = keadaan();

  if (!kead.aktif) {
    return {
      ok: false,
      aktif: false,
      sumber: SUMBER,
      atribusi: ATRIBUSI,
      item: [],
      jumlah: 0,
      diambilAt: null,
      umurMs: null,
      galat: null,
      keadaan: kead
    };
  }

  if (!opsi.paksa && cache && (sekarang - cache.diambilAt) < CACHE_MS) {
    return hasil(cache, sekarang, { dariCache: true });
  }

  const fetchImpl = opsi.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) {
    return Object.assign(hasil(cache, sekarang, {}), {
      ok: false,
      galat: 'pengambil data tidak tersedia di lingkungan ini'
    });
  }

  try {
    const payload = await ambilDenganBatas(fetchImpl, urlDaftar(opsi), TIMEOUT_MS);
    const daftarMentah = Array.isArray(payload) ? payload : (payload && payload.webcams) || [];
    const item = [];
    const foto = {};
    for (const w of daftarMentah) {
      const n = normalizeWebcam(w);
      if (!n) continue;
      // Kamera ganda dibuang: satu kamera bisa muncul di dua halaman/daftar.
      if (item.some(function (x) { return x.id === n.id; })) continue;
      if (n._fotoUrl) foto[n.id] = n._fotoUrl;
      delete n._fotoUrl;
      item.push(n);
    }
    cache = {
      diambilAt: sekarang,
      item: item,
      foto: foto,
      jumlahHalaman: Array.isArray(payload) ? null : angka(payload && payload.total)
    };
    return hasil(cache, sekarang, { dariCache: false });
  } catch (err) {
    const sebab = err && err.name === 'AbortError'
      ? 'batas waktu ' + (TIMEOUT_MS / 1000) + ' detik terlampaui'
      : ((err && err.message) || 'sumber tidak dapat dihubungi');
    return Object.assign(hasil(cache, sekarang, {}), {
      ok: false,
      galat: sebab + (/HTTP 403/.test(sebab)
        ? ' - kunci API ditolak Windy; periksa WINDY_WEBCAMS_KEY' : ''),
      basi: cache ? true : false
    });
  }
}

function hasil(s, sekarang, opsi) {
  const diambilAt = s ? s.diambilAt : null;
  const umurMs = diambilAt ? Math.max(0, sekarang - diambilAt) : null;
  return {
    ok: true,
    aktif: true,
    sumber: SUMBER,
    atribusi: ATRIBUSI,
    item: s ? s.item : [],
    jumlah: s ? s.item.length : 0,
    diambilAt: diambilAt ? new Date(diambilAt).toISOString() : null,
    umurMs: umurMs,
    basi: opsi.basi === true,
    dariCache: opsi.dariCache === true,
    galat: null,
    keadaan: keadaan()
  };
}

/**
 * Alirkan thumbnail satu kamera lewat server, supaya daftar CSP tetap ketat
 * (hanya 'self') dan alamat CDN Windy tidak perlu dibuka di peramban.
 * Alamat gambar diambil dari balasan API yang sudah tersimpan di cache.
 */
async function ambilFoto(id, opsi = {}) {
  if (!keadaan().aktif) return { ok: false, galat: 'kunci API Windy belum dipasang' };
  const fetchImpl = opsi.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchImpl) return { ok: false, galat: 'pengambil data tidak tersedia' };
  const jumlah = opsi.jumlah === undefined ? 50 : opsi.jumlah;
  if (!cache || opsi.paksa) await ambilWebcam({ fetchImpl: fetchImpl, paksa: opsi.paksa, limit: jumlah });
  const data = cache && cache.foto ? cache.foto : null;
  const url = data && data[String(id)];
  if (!url) return { ok: false, galat: 'kamera tidak ada di daftar' };
  try {
    const res = await ambilDenganBatas(fetchImpl, url, TIMEOUT_MS, { mentah: true });
    const tipe = (res.headers && res.headers.get && res.headers.get('content-type')) || 'image/jpeg';
    // Isinya diambil utuh, bukan dialirkan: berkasnya kecil (puluhan sampai
    // ratusan kilobita) dan cara ini tidak bergantung pada jenis aliran yang
    // dipakai lingkungan produksi.
    const isi = typeof res.arrayBuffer === 'function'
      ? Buffer.from(await res.arrayBuffer())
      : (Buffer.isBuffer(res.isi) ? res.isi : null);
    if (!isi || !isi.length) throw new Error('gambar kosong');
    return { ok: true, tipe: tipe, isi: isi };
  } catch (err) {
    return { ok: false, galat: (err && err.message) || 'gambar tidak dapat diambil' };
  }
}

module.exports = {
  SUMBER,
  ATRIBUSI,
  NEGARA,
  CACHE_MS,
  LIMIT_MAKS,
  URL_DAFTAR,
  keadaan,
  ambilWebcam,
  ambilFoto,
  normalizeWebcam,
  urlDaftar,
  _setCache: function (isi) { cache = isi; }
};
