'use strict';
/**
 * Peran akses operasional (RBAC): VIEWER < OPERATOR < ADMIN.
 *
 * KENAPA ADA
 * ----------
 * Sebelumnya satu-satunya penjaga adalah `OPS_WRITE_TOKEN` — semua atau
 * tidak sama sekali. Itu cukup untuk "jangan sampai orang sembarangan mengubah
 * data", tetapi tidak bisa menyatakan hal yang sebenarnya sering dibutuhkan:
 * ada orang yang boleh MEMBACA, ada yang boleh MENANGANI insiden, dan ada yang
 * boleh MEMICU pengambilan data hulu (mahal: memakai kuota sumber).
 *
 * PILIHAN YANG SENGAJA DIAMBIL
 * ----------------------------
 * 1. TANPA token apa pun, aplikasi berjalan seperti sebelumnya (mode
 *    "terbuka") dan mode itu DIKATAKAN di API + antarmuka. Aplikasi ini
 *    memang papan publik; mengunci diri sendiri tanpa dikonfigurasi akan
 *    membuat orang mengira sudah aman padahal belum.
 * 2. Baca tetap publik sebagai bawaan. `OPS_READ_PROTECTED=1` membuat baca
 *    perlu peran VIEWER — untuk pemasangan yang memang privat.
 * 3. `OPS_WRITE_TOKEN` yang sudah ada tetap bekerja: ia diperlakukan sebagai
 *    token tingkat ADMIN, sehingga pemasangan lama tidak berubah perilakunya.
 * 4. Token TIDAK pernah dikembalikan API. `/api/operations/access` hanya
 *    menyatakan peran mana yang terkonfigurasi dan peran Anda sendiri.
 * 5. Perbandingan token memakai waktu tetap (timingSafeEqual) agar tidak
 *    membocorkan panjang/awalan token lewat selisih waktu balasan.
 */

const crypto = require('crypto');

const PERAN = ['VIEWER', 'OPERATOR', 'ADMIN'];
const BOBOT = { VIEWER: 1, OPERATOR: 2, ADMIN: 3 };

// Operasi mahal (memicu pengambilan data hulu) menuntut ADMIN; operasi
// penanganan insiden menuntut OPERATOR. Terdokumentasi di README.
const MIN_TULIS = 'OPERATOR';
const MIN_EVALUASI = 'ADMIN';

/**
 * Sumber token per peran. `OPS_WRITE_TOKEN` adalah alias lama untuk ADMIN:
 * sudah didokumentasikan sejak P0, jadi tidak boleh berhenti bekerja.
 */
function sumberToken(peran) {
  if (peran === 'ADMIN') return ['OPS_TOKEN_ADMIN', 'OPS_WRITE_TOKEN'];
  if (peran === 'OPERATOR') return ['OPS_TOKEN_OPERATOR'];
  return ['OPS_TOKEN_VIEWER'];
}

function tokenPeran(peran) {
  return sumberToken(peran)
    .map(k => (process.env[k] || '').trim())
    .filter(Boolean);
}

/** Keadaan konfigurasi — dipakai rute, antarmuka, dan dokumentasi. */
function konfigurasi() {
  const peranDikonfigurasi = {};
  PERAN.forEach(p => { peranDikonfigurasi[p] = tokenPeran(p).length > 0; });
  const aktif = PERAN.some(p => peranDikonfigurasi[p]);
  return {
    aktif,
    mode: aktif ? 'token' : 'terbuka',
    peranDikonfigurasi,
    readProtected: process.env.OPS_READ_PROTECTED === '1',
    minTulis: MIN_TULIS,
    minEvaluasi: MIN_EVALUASI
  };
}

/** Perbandingan waktu tetap; panjang berbeda langsung gagal (tetap konstan). */
function sama(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/** Peran pemilik token, atau null bila token tidak dikenal/kosong. */
function peranDariToken(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  // ADMIN lebih dulu supaya token yang dipasang di dua variabel tetap dibaca
  // sebagai peran tertinggi.
  for (const p of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    if (tokenPeran(p).some(tok => sama(tok, t))) return p;
  }
  return null;
}

function cukup(peran, minimal) {
  return !!peran && BOBOT[peran] >= BOBOT[minimal];
}

/** Keterangan untuk API/antarmuka — tanpa pernah membocorkan tokennya. */
function info(peranAnda) {
  const k = konfigurasi();
  return {
    mode: k.mode,
    peranDikonfigurasi: k.peranDikonfigurasi,
    readProtected: k.readProtected,
    minTulis: k.minTulis,
    minEvaluasi: k.minEvaluasi,
    peranAnda: peranAnda || null,
    keterangan: k.aktif
      ? 'Akses memakai token. Peran ' + MIN_TULIS + ' diperlukan untuk menangani insiden; ' +
        MIN_EVALUASI + ' untuk memicu evaluasi.'
      : 'Mode terbuka: tidak ada token yang dikonfigurasi, sehingga siapa pun yang dapat menjangkau ' +
        'server ini boleh mengubah data operasional. Pasang OPS_TOKEN_VIEWER/OPERATOR/ADMIN untuk mengunci.'
  };
}

/**
 * Penjaga rute. Bila tidak ada token terkonfigurasi, penjaga ini MELOLOSKAN
 * semuanya (mode terbuka) dan menandai req.opsPeran = null supaya rute bisa
 * menyatakan modenya apa adanya.
 */
function butuh(minimal, opsi) {
  const o = opsi || {};
  return (req, res, next) => {
    const k = konfigurasi();
    if (!k.aktif) {
      req.opsPeran = null;
      return next();
    }
    const peran = peranDariToken(req.get('x-ops-token'));
    if (!peran) {
      return res.status(401).json({
        error: 'Butuh header x-ops-token yang sah untuk tindakan ini.',
        mode: 'token',
        butuh: minimal
      });
    }
    if (!cukup(peran, minimal)) {
      return res.status(403).json({
        error: 'Peran ' + peran + ' tidak cukup untuk tindakan ini (butuh ' + minimal + ').',
        peran,
        butuh: minimal
      });
    }
    req.opsPeran = peran;
    if (o.rekam) o.rekam(peran);
    next();
  };
}

/** Penjaga baca: publik sebagai bawaan, terkunci bila OPS_READ_PROTECTED=1. */
function baca() {
  return (req, res, next) => {
    const k = konfigurasi();
    if (!k.aktif || !k.readProtected) {
      req.opsPeran = peranDariToken(req.get('x-ops-token'));
      return next();
    }
    return butuh('VIEWER')(req, res, next);
  };
}

module.exports = {
  PERAN, BOBOT, MIN_TULIS, MIN_EVALUASI,
  konfigurasi, peranDariToken, cukup, info, butuh, baca
};
