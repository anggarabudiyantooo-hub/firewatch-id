'use strict';
/**
 * Kesegaran data, FRESH / STALE / CRITICAL / UNKNOWN.
 *
 * Ambang HARUS eksplisit dan terdokumentasi (diminta pada spesifikasi).
 * Semuanya kelipatan interval jadwal sumber itu sendiri, bukan menit tetap,
 * karena "5 menit" berarti beda untuk gempa (tiap 2 menit) dan kekeringan
 * (tiap 6 jam):
 *
 *   FRESH    data masih dalam 1,5x interval  → penyegaran berjalan normal
 *   STALE    > 1,5x dan <= 6x interval       → satu-dua putaran terlewat
 *   CRITICAL > 6x interval                   → beberapa putaran terlewat
 *   UNKNOWN  belum pernah berhasil, atau interval tak diketahui
 *
 * Kelipatannya dapat diatur: OPS_FRESH_STALE_MULT (default 1.5),
 * OPS_FRESH_CRIT_MULT (default 6). Nilai dipakai apa adanya di UI (ditulis
 * di catatan halaman) supaya tidak ada ambang tersembunyi.
 */

function angka(nama, bawaan) {
  const v = parseFloat(process.env[nama]);
  return Number.isFinite(v) && v > 0 ? v : bawaan;
}

const MULT_STALE = angka('OPS_FRESH_STALE_MULT', 1.5);
const MULT_CRIT = angka('OPS_FRESH_CRIT_MULT', 6);

function ambang() {
  return { staleMult: MULT_STALE, critMult: MULT_CRIT };
}

/**
 * @param {number|null} ageMs     umur data terakhir yang berhasil, null bila belum pernah
 * @param {number} everyMs        interval jadwal sumber
 */
function nilai(ageMs, everyMs) {
  if (!ageMs && ageMs !== 0) return { status: 'UNKNOWN', reason: 'belum pernah berhasil ditarik' };
  if (!everyMs || everyMs <= 0) return { status: 'UNKNOWN', reason: 'interval tidak diketahui' };
  const rasio = ageMs / everyMs;
  if (rasio <= MULT_STALE) return { status: 'FRESH', ratio: +rasio.toFixed(2) };
  if (rasio <= MULT_CRIT) return { status: 'STALE', ratio: +rasio.toFixed(2) };
  return { status: 'CRITICAL', ratio: +rasio.toFixed(2) };
}

module.exports = { nilai, ambang, MULT_STALE, MULT_CRIT };
