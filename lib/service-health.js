'use strict';
/**
 * Kesehatan layanan — model seragam untuk tiap sumber data.
 *
 * Sumber kebenaran: `Scheduler.status()` (lib/scheduler.js) yang memang sudah
 * mencatat runs/fails/consecutiveFails/errorNote, ditambah dua field baru
 * yang saya tambahkan di sana: `responseTimeMs` (lama panggilan terakhir) dan
 * `lastCheckedAt` (kapan terakhir dicoba). Tidak ada metrik karangan:
 * yang tidak terukur dikembalikan null, bukan angka.
 *
 * Status:
 *   HEALTHY  pengambilan terakhir sukses dan umur data wajar
 *   WARNING  data ada tetapi kesegarannya STALE, atau ada kegagalan belum lama
 *   DOWN     gagal berturut-turut >= 3 dan tidak ada data yang bisa dipakai
 *   UNKNOWN  belum pernah dicoba / tidak ada data (mis. host tanpa penjadwal)
 */

const freshness = require('./freshness');
const scheduler = require('./scheduler-instance');

const DOWN_AFTER = 3;

/**
 * @param {object} st payload /api/status (scheduler.status())
 */
function bangun(st) {
  const tugas = (st && st.tasks) || [];
  return tugas.map(t => {
    const f = freshness.nilai(t.ageMs, t.everyMs);
    let status;
    if ((t.consecutiveFails || 0) >= DOWN_AFTER && !t.hasData) status = 'DOWN';
    else if (!t.hasData && (t.runs || 0) === 0 && (t.fails || 0) === 0) status = 'UNKNOWN';
    else if (!t.hasData) status = 'DOWN';
    else if (f.status === 'CRITICAL') status = 'DOWN';
    else if (f.status === 'STALE' || (t.consecutiveFails || 0) > 0) status = 'WARNING';
    else status = 'HEALTHY';

    return {
      id: t.id,
      name: t.label,
      type: 'data-source',
      status,
      lastCheckedAt: t.lastCheckedAt || null,
      lastSuccessfulAt: t.lastOk || null,
      responseTime: t.responseTimeMs != null ? t.responseTimeMs : null,
      errorCount: t.fails || 0,
      consecutiveFails: t.consecutiveFails || 0,
      endpoint: t.endpoint || null,
      description: t.everyLabel ? 'Dijadwalkan ' + t.everyLabel : null,
      critical: !!t.critical,
      backoff: !!t.backoff,
      errorNote: t.errorNote || null,
      freshness: f
    };
  });
}

function ringkas(services) {
  const c = { total: services.length, healthy: 0, warning: 0, down: 0, unknown: 0 };
  for (const s of services) {
    if (s.status === 'HEALTHY') c.healthy++;
    else if (s.status === 'WARNING') c.warning++;
    else if (s.status === 'DOWN') c.down++;
    else c.unknown++;
  }
  return c;
}

/**
 * Ringkasan aplikasi itu sendiri (bukan sumber hulu). Semua angka nyata:
 * uptime proses = selisih process.uptime(), versi Node, mode penyimpanan
 * operasional, dan penjadwal.
 */
/**
 * Terjemahkan status penjadwal menjadi status APLIKASI. Dipisah dari
 * aplikasi() supaya bisa diuji tanpa instance penjadwal sungguhan.
 *
 * Aturan jujur: proses yang baru hidup belum mengukur apa pun. Menyebutnya
 * DOWN berarti mengklaim kegagalan yang belum pernah terjadi; menyebutnya
 * HEALTHY berarti mengklaim sehat tanpa bukti. Karena itu keadaannya
 * dilaporkan apa adanya sebagai UNKNOWN + sebabnya.
 */
function statusAplikasi(st) {
  const total = (st && st.total) || 0;
  const healthy = (st && st.healthy) || 0;
  const totalFails = (st && st.summary && st.summary.totalFails) || 0;
  if (total > 0 && healthy === total) return { status: 'HEALTHY', reason: null };
  if (healthy > 0) {
    return { status: 'WARNING', reason: healthy + '/' + total + ' tugas sudah menghasilkan data pada instance ini' };
  }
  if (totalFails === 0) {
    return { status: 'UNKNOWN', reason: 'belum ada tugas yang terukur pada instance ini (proses baru berjalan)' };
  }
  return { status: 'DOWN', reason: total + ' tugas tanpa data, ' + totalFails + ' kegagalan tercatat' };
}

function aplikasi(store) {
  const st = scheduler.status();
  const s = statusAplikasi(st);
  return {
    status: s.status,
    statusReason: s.reason,
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    nodeVersion: process.version,
    schedulerMode: process.env.VERCEL ? 'penjadwal luar (GitHub Actions)' : 'timer internal',
    storage: store.info(),
    checkedAt: new Date().toISOString()
  };
}

/**
 * Alarm yang bisa dipakai MONITOR APA PUN (bukan hanya GitHub Actions).
 *
 * Latar (4 Okt): alur kerja GitHub yang seharusnya memanggil /api/cron tiap 10
 * menit ternyata berjalan berjam-jam sekali — jadwal GitHub memang best-effort.
 * Akibatnya data menua tanpa ada yang memberi tahu, dan alarmnya pun telat.
 * Dengan fungsi ini, satu URL sudah cukup: monitor mana pun (gratis sekalipun)
 * bisa memeriksa HTTP 200 vs 503, lalu mengirim surel saat gagal.
 *
 * Aturan yang dipilih dengan sadar:
 *   GAGAL bila ada sumber KRITIS yang DOWN (data lama/mati) — itu keadaan yang
 *   memang perlu orang. "UNKNOWN" (belum pernah terukur di instance ini) TIDAK
 *   memicu gagal: instance baru selalu mulai tanpa pengukuran, dan alarm yang
 *   berbunyi setiap kali instance didaur ulang akan dilatih untuk diabaikan.
 *   Jumlah UNKNOWN tetap dilaporkan supaya bisa dilihat.
 */
function alarm(services) {
  const kejadian = [];
  services.filter(s => s.status === 'DOWN').forEach(s => {
    kejadian.push({ id: s.id, sebab: 'data sumber tidak tersedia atau kedaluwarsa kritis',
      tingkat: s.critical ? 'kritis' : 'biasa' });
  });
  const adaKritisGagal = kejadian.some(k => k.tingkat === 'kritis');
  return {
    ok: kejadian.length === 0,
    tingkat: kejadian.length === 0 ? 'normal' : (adaKritisGagal ? 'kritis' : 'peringatan'),
    kejadian,
    ringkas: ringkas(services)
  };
}

module.exports = { bangun, ringkas, aplikasi, statusAplikasi, alarm, DOWN_AFTER };
