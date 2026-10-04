'use strict';
/**
 * Alert engine — aturan berbasis kondisi nyata.
 *
 * Prinsip yang dipegang:
 *  1. Aturan hanya membaca angka yang SUDAH diukur sistem (kesehatan sumber,
 *     kesegaran, lama panggilan, klaster titik api). Tidak ada simulasi.
 *  2. Semua tipe data science dari FireWatch tetap seperti semula: klaster
 *     titik api adalah kandidat lokasi panas menurut FIRMS, BUKAN klaim
 *     kebakaran yang terverifikasi.
 *  3. `evaluate()` murni (tanpa I/O) supaya bisa diuji tanpa jaringan;
 *     penyimpanan & deduplikasi dilakukan `jalankan()`.
 *
 * Aturan (semua ambang dari env, ada bawaannya):
 *   source_down     status layanan DOWN                        → HIGH bila tugas kritis, else MEDIUM
 *   data_critical   kesegaran CRITICAL                          → HIGH
 *   api_slow        lama panggilan terakhir > OPS_SLOW_MS       → LOW
 *   hotspot_cluster klaster FIRMS ≥ OPS_HOTSPOT_CLUSTER titik   → MEDIUM (kandidat)
 */

const store = require('./ops-store');

const SLOW_MS = Number(process.env.OPS_SLOW_MS || 4000);
const CLUSTER_MIN = Number(process.env.OPS_HOTSPOT_CLUSTER || 50);
// Di musim kemarau jumlah sel dengan titik api banyak bisa puluhan sekaligus.
// Membuat alert untuk semuanya = banjir alert yang justru menyembunyikan yang
// penting. Yang diberi alert hanya N klaster TERBESAR di atas ambang; daftar
// lengkapnya tetap terlihat di dashboard. Angka ini diukur dari data nyata:
// pada 4 Okt 2026 ada 40 klaster dengan 36 di antaranya >= 100 titik.
const CLUSTER_MAX = Number(process.env.OPS_HOTSPOT_MAX || 5);
const DEDUP_MS = Number(process.env.OPS_ALERT_DEDUP_MS || 30 * 60 * 1000);

function kecamatanId(a) {
  // Kunci subjek harus stabil antar-evaluasi; id layanan/klaster dipakai apa adanya.
  return String(a);
}

/**
 * @param {object} masuk
 * @param {Array} masuk.services  keluaran lib/service-health bangun()
 * @param {Array} masuk.clusters  klaster titik api (server.js clusterHotspots) — opsional
 * @returns {Array} kandidat alert (belum tersimpan)
 */
function evaluate({ services = [], clusters = [] } = {}) {
  const out = [];

  for (const s of services) {
    if (s.status === 'DOWN') {
      out.push({
        ruleId: 'source_down',
        subject: 'service:' + s.id,
        severity: s.critical ? 'HIGH' : 'MEDIUM',
        title: 'Sumber data tidak tersedia: ' + s.name,
        detail: [
          'Gagal ' + s.consecutiveFails + ' kali berturut-turut' +
            (s.errorCount ? ' (total ' + s.errorCount + ' kegagalan)' : '') + '.',
          s.errorNote ? 'Penyebab terakhir dari sistem: ' + s.errorNote + '.' : null,
          s.lastSuccessfulAt ? 'Keberhasilan terakhir: ' + s.lastSuccessfulAt + '.' : 'Belum pernah berhasil sejak instance ini hidup.',
          s.backoff ? 'Pengambilan dijeda 30 menit agar sumber tidak dihujani permintaan.' : null
        ].filter(Boolean),
        facts: [
          'consecutiveFails=' + s.consecutiveFails,
          'lastCheckedAt=' + (s.lastCheckedAt || 'null'),
          'responseTimeMs=' + (s.responseTime != null ? s.responseTime : 'null')
        ],
        serviceId: s.id
      });
    }

    if (s.freshness && s.freshness.status === 'CRITICAL' && s.status !== 'DOWN') {
      out.push({
        ruleId: 'data_critical',
        subject: 'service:' + s.id,
        severity: 'HIGH',
        title: 'Data kedaluwarsa: ' + s.name,
        detail: [
          'Umur data ' + s.freshness.ratio + '× interval jadwal (ambang CRITICAL).',
          'Angka yang ditampilkan dari sumber ini berisiko tidak mewakili keadaan sekarang.'
        ],
        facts: ['ratio=' + s.freshness.ratio, 'ageMs=' + (s.lastSuccessfulAt ? 'ada' : 'null')],
        serviceId: s.id
      });
    }

    if (s.responseTime != null && s.responseTime > SLOW_MS) {
      out.push({
        ruleId: 'api_slow',
        subject: 'service:' + s.id,
        severity: 'LOW',
        title: 'Respons lambat: ' + s.name,
        detail: ['Panggilan terakhir memakan ' + s.responseTime + ' ms (ambang ' + SLOW_MS + ' ms).'],
        facts: ['responseTimeMs=' + s.responseTime, 'thresholdMs=' + SLOW_MS],
        serviceId: s.id
      });
    }
  }

  const besar = clusters
    .map(c => Object.assign({ count: c.count || c.n || 0 }, c))
    .filter(c => c.count >= CLUSTER_MIN)
    .sort((a, b) => b.count - a.count)
    .slice(0, CLUSTER_MAX);

  for (const c of besar) {
    const jumlah = c.count || c.n || 0;
    {
      out.push({
        ruleId: 'hotspot_cluster',
        subject: kecamatanId(c.id || (c.lat.toFixed(2) + ',' + c.lon.toFixed(2))),
        severity: 'MEDIUM',
        title: 'Klaster titik api terdeteksi (' + jumlah + ' titik)',
        // FireWatch memakai kata "titik api"/"hotspot": anomali termal citra
        // satelit, bukan bukti kebakaran. Klaim itu dipertahankan di sini.
        detail: [
          'Klaster ' + jumlah + ' titik api berpusat di ' + c.lat.toFixed(2) + ', ' + c.lon.toFixed(2) +
            ' (ambang ' + CLUSTER_MIN + ' titik).',
          'Titik api adalah anomali termal dari citra satelit — indikasi awal, bukan kebakaran terverifikasi.'
        ],
        facts: ['count=' + jumlah, 'center=' + c.lat.toFixed(2) + ',' + c.lon.toFixed(2)],
        serviceId: c.id || null
      });
    }
  }

  return out;
}

/**
 * Simpan kandidat alert dengan deduplikasi: kunci `ruleId+subject` yang masih
 * aktif dalam jendela DEDUP_MS tidak dibuat ulang. Alert yang kondisinya hilang
 * ditandai RESOLVED (bukan dihapus) supaya riwayat tetap utuh.
 *
 * @param {Array} kandidat keluaran evaluate()
 * @param {Array} aktif    alert tersimpan
 */
function sinkronkan(kandidat, aktif, now = Date.now(), counters = {}) {
  const baru = [];
  const alertAktif = aktif.filter(a => a.status === 'ACTIVE');
  const tanggal = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');

  for (const k of kandidat) {
    const kunci = k.ruleId + '|' + k.subject;
    const serupa = alertAktif.find(a => a.ruleId + '|' + a.subject === kunci);
    if (serupa && now - Date.parse(serupa.detectedAt) < DEDUP_MS) continue; // dedup
    counters.alert = (counters.alert || 0) + 1;
    baru.push(Object.assign({
      id: 'ALR-' + tanggal + '-' + String(counters.alert).padStart(5, '0'),
      status: 'ACTIVE',
      detectedAt: new Date(now).toISOString(),
      incidentId: null
    }, k));
  }

  // Kondisi yang tidak lagi ada pada evaluasi ini → alert aktif lama ditutup.
  const kunciKini = new Set(kandidat.map(k => k.ruleId + '|' + k.subject));
  const ditutup = [];
  for (const a of alertAktif) {
    if (!kunciKini.has(a.ruleId + '|' + a.subject)) {
      a.status = 'RESOLVED';
      a.resolvedAt = new Date(now).toISOString();
      ditutup.push(a.id + ' (' + a.ruleId + ')');
    }
  }
  return { baru, ditutup };
}

/** Evaluasi + simpan. Dipanggil dari /api/cron dan /api/operations/alerts (evaluate manual). */
/**
 * Evaluasi + simpan, dibungkus kunci penyimpanan: penilaian alert membaca dan
 * menulis dokumen yang sama dengan operator, jadi urutannya harus utuh.
 */
async function jalankan(ctx) {
  return store.kunci(() => jalankanDalam(ctx));
}

async function jalankanDalam(ctx) {
  const data = await store.read();
  const kandidat = evaluate(ctx);
  const { baru, ditutup } = sinkronkan(kandidat, data.alerts || [], Date.now(), data.counters || {});
  data.counters = data.counters || {};
  data.alerts = [...baru, ...(data.alerts || [])].slice(0, 200);
  if (baru.length || ditutup.length) {
    store.catatAudit(data, {
      actor: 'sistem', action: 'alert_dievaluasi', target: (baru.length + ditutup.length) + ' perubahan',
      detail: baru.length + ' alert baru' + (baru.length ? ' (' + baru.slice(0, 3).map(x => x.id).join(', ') + ')' : '') +
        ' · ' + ditutup.length + ' ditutup'
    });
  }
  await store.write(data);
  return { baru, ditutup, total: kandidat.length, mode: store.mode };
}

module.exports = { evaluate, sinkronkan, jalankan, SLOW_MS, CLUSTER_MIN, CLUSTER_MAX, DEDUP_MS };
