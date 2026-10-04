#!/usr/bin/env node
'use strict';
/**
 * Uji modul Operations Center — dijalankan di `npm run check` bersama uji lain.
 *
 * Semua uji di sini TANPA jaringan: modul ops dirancang menerima data sebagai
 * argumen sehingga perilakunya bisa dibuktikan tanpa bergantung pada sumber
 * hulu yang sedang hidup atau mati.
 *
 * Cakupan (sesuai daftar pengujian yang diminta):
 *   kesegaran  — FRESH / STALE / CRITICAL / UNKNOWN + ambang dapat diatur
 *   kesehatan  — layanan sehat, gagal, timeout (belum ada respons), data tua
 *   alert      — aturan menyala, tidak menyala saat wajar, anti-duplikasi,
 *                alert yang kondisinya hilang ditutup (bukan dihapus)
 *   insiden    — buat/ubah/tugaskan/eskalasi/selesaikan/tutup + transisi
 *                yang tidak sah ditolak + timeline tercatat + metrik kosong
 *                melaporkan null ("belum ada riwayat"), bukan angka karangan
 */

const path = require('path');
process.env.OPS_STORE_FORCE = 'file'; // pastikan tidak menyentuh layanan luar

const freshness = require('../lib/freshness');
const health = require('../lib/service-health');
const alerts = require('../lib/alert-engine');
const incidents = require('../lib/incidents');
const runbooks = require('../lib/runbooks');

let lulus = 0, gagal = 0;
function cek(nama, dapat, harap) {
  const ok = JSON.stringify(dapat) === JSON.stringify(harap);
  if (ok) { lulus++; console.log('  LULUS  ' + nama); }
  else { gagal++; console.log('  GAGAL  ' + nama + '\n         dapat ' + JSON.stringify(dapat) + '\n         harap ' + JSON.stringify(harap)); }
}

// ------------------------------------------------------------------ kesegaran
console.log('\n== kesegaran data ==');
cek('data baru → FRESH', freshness.nilai(60 * 1000, 120 * 1000).status, 'FRESH');
cek('> 1,5x interval → STALE', freshness.nilai(4 * 60 * 1000, 120 * 1000).status, 'STALE');
cek('> 6x interval → CRITICAL', freshness.nilai(13 * 60 * 1000, 120 * 1000).status, 'CRITICAL');
cek('belum pernah → UNKNOWN', freshness.nilai(null, 120 * 1000).status, 'UNKNOWN');
cek('interval tak diketahui → UNKNOWN', freshness.nilai(1000, 0).status, 'UNKNOWN');
cek('ambang terdokumentasi', freshness.ambang(), { staleMult: 1.5, critMult: 6 });

// ------------------------------------------------------------------ kesehatan
function tugas(over) {
  return Object.assign({
    id: 'x', label: 'X', everyMs: 120000, everyLabel: 'tiap 2 menit',
    hasData: true, ageMs: 60000, ageLabel: '1 menit lalu', runs: 5, fails: 0,
    consecutiveFails: 0, healthy: true, errorNote: null, critical: false,
    responseTimeMs: 400, lastCheckedAt: new Date().toISOString(), endpoint: 'contoh.test'
  }, over || {});
}
console.log('\n== kesehatan layanan ==');
cek('sehat', health.bangun({ tasks: [tugas()] })[0].status, 'HEALTHY');
cek('gagal 3x tanpa data → DOWN', health.bangun({ tasks: [tugas({ hasData: false, consecutiveFails: 3, healthy: false })] })[0].status, 'DOWN');
cek('gagal 1x dengan data segar → WARNING', health.bangun({ tasks: [tugas({ consecutiveFails: 1, healthy: false })] })[0].status, 'WARNING');
cek('data sangat tua → DOWN', health.bangun({ tasks: [tugas({ ageMs: 13 * 60000 })] })[0].status, 'DOWN');
cek('belum pernah dicoba → UNKNOWN', health.bangun({ tasks: [tugas({ hasData: false, runs: 0, fails: 0, ageMs: null, healthy: false })] })[0].status, 'UNKNOWN');
cek('waktu respons tak terukur tetap null', health.bangun({ tasks: [tugas({ responseTimeMs: null })] })[0].responseTime, null);
cek('ringkasan menghitung tiap status',
  health.ringkas(health.bangun({ tasks: [tugas(), tugas({ id: 'y', hasData: false, consecutiveFails: 3, healthy: false })] })),
  { total: 2, healthy: 1, warning: 0, down: 1, unknown: 0 });

// ------------------------------------------------------------------- alert
console.log('\n== alert engine ==');
const layananDown = health.bangun({ tasks: [tugas({ id: 'shelter', label: 'Pengungsi (BNPB)', hasData: false, consecutiveFails: 4, healthy: false, errorNote: 'bnpb 520' })] });
const kandidatDown = alerts.evaluate({ services: layananDown });
cek('sumber DOWN memicu aturan source_down', kandidatDown.map(k => k.ruleId), ['source_down']);
cek('severity mengikuti status kritis tugas', kandidatDown[0].severity, 'MEDIUM');
cek('detail memuat penyebab dari sistem', /bnpb 520/.test(kandidatDown[0].detail.join(' ')), true);

const kandidatSehat = alerts.evaluate({ services: health.bangun({ tasks: [tugas()] }) });
cek('keadaan sehat tidak memicu alert', kandidatSehat.length, 0);

const lambat = alerts.evaluate({ services: health.bangun({ tasks: [tugas({ responseTimeMs: alerts.SLOW_MS + 1 })] }) });
cek('respons lambat memicu api_slow', lambat.map(k => k.ruleId), ['api_slow']);

const klaster = alerts.evaluate({ services: [], clusters: [{ id: 'c1', lat: -1.5, lon: 102.3, count: alerts.CLUSTER_MIN, frp: 300 }] });
cek('klaster titik api memicu hotspot_cluster', klaster.map(k => k.ruleId), ['hotspot_cluster']);

// Musim kemarau bisa menghasilkan puluhan sel besar sekaligus; hanya yang
// TERBESAR yang diberi alert supaya tidak banjir alert.
const banyak = [];
for (let i = 0; i < 12; i++) banyak.push({ id: 'k' + i, lat: i, lon: 100 + i, count: 60 + i, frp: 100 });
cek('klaster dibatasi N terbesar', alerts.evaluate({ services: [], clusters: banyak }).length, alerts.CLUSTER_MAX);
cek('ambang klaster default terdokumentasi', alerts.CLUSTER_MIN, 50);
cek('klaster di bawah ambang tidak memicu',
  alerts.evaluate({ services: [], clusters: [{ id: 'c2', lat: 0, lon: 100, count: alerts.CLUSTER_MIN - 1, frp: 10 }] }).length, 0);
cek('alert lingkungan menyebut kandidat, bukan kebakaran',
  /bukan kebakaran terverifikasi|bukan kebakaran/i.test(klaster[0].detail.join(' ')), true);

const now = Date.now();
const alertLama = [{ id: 'ALR-1', ruleId: 'source_down', subject: 'service:shelter', status: 'ACTIVE', detectedAt: new Date(now - 60 * 1000).toISOString() }];
const d1 = alerts.sinkronkan(kandidatDown, alertLama, now);
cek('duplikat dalam jendela dedup tidak dibuat ulang', d1.baru.length, 0);
const counters = {};
const dx = alerts.sinkronkan([kandidatDown[0], kandidatDown[0]].map((k, i) => Object.assign({}, k, { subject: 'service:x' + i })), [], now, counters);
cek('id alert berurutan dan unik', [dx.baru[0].id, dx.baru[1].id].filter((x, i, a) => a.indexOf(x) === i).length, 2);
cek('format id alert ALR-YYYYMMDD-NNNNN', /^ALR-\d{8}-\d{5}$/.test(dx.baru[0].id), true);
const d2 = alerts.sinkronkan(kandidatDown, alertLama, now + alerts.DEDUP_MS + 1000);
cek('setelah jendela dedup, alert dibuat lagi', d2.baru.length, 1);
const d3 = alerts.sinkronkan([], alertLama, now);
cek('kondisi hilang → alert ditutup (bukan dihapus)', [d3.ditutup.length, alertLama[0].status], [1, 'RESOLVED']);

// ------------------------------------------------------------------ insiden
console.log('\n== insiden ==');
(async () => {
  const inc = await incidents.create({ title: 'Uji insiden', severity: 'HIGH', category: 'data_source_unavailable', assignedTo: 'Tim Operasi' }, 'uji');
  cek('nomor insiden berformat INC-YYYY-NNNNN', /^INC-\d{4}-\d{5}$/.test(inc.incidentId), true);
  cek('status awal OPEN', inc.status, 'OPEN');
  cek('timeline mencatat pembuatan + penugasan', inc.timeline.map(t => t.type), ['created', 'assigned']);

  const eskalasi = await incidents.escalate(inc.incidentId, { to: 'Koordinator' }, 'uji');
  cek('eskalasi menaikkan tingkat', eskalasi.escalationLevel, 1);

  const inv = await incidents.patch(inc.incidentId, { status: 'INVESTIGATING', note: 'Diperiksa: hulu 5xx' }, 'uji');
  cek('OPEN → INVESTIGATING diterima', inv.status, 'INVESTIGATING');
  cek('catatan investigasi masuk timeline', inv.timeline.some(t => t.type === 'note'), true);

  let tolak = null;
  try { await incidents.patch(inc.incidentId, { status: 'CLOSED' }, 'uji'); } catch (e) { tolak = e.statusCode; }
  cek('INVESTIGATING → CLOSED ditolak (409)', tolak, 409);

  const selesai = await incidents.patch(inc.incidentId, { status: 'RESOLVED', resolution: 'Hulu pulih' }, 'uji');
  cek('RESOLVED menyimpan penyelesaian', selesai.resolution, 'Hulu pulih');
  const ditutup = await incidents.patch(inc.incidentId, { status: 'CLOSED' }, 'uji');
  cek('RESOLVED → CLOSED diterima', ditutup.status, 'CLOSED');
  let tolak2 = null;
  try { await incidents.patch(inc.incidentId, { status: 'OPEN' }, 'uji'); } catch (e) { tolak2 = e.statusCode; }
  cek('CLOSED tidak bisa dibuka lagi', tolak2, 409);

  cek('runbook dikaitkan ke kategori insiden',
    runbooks.untukKategori('data_source_unavailable').map(r => r.id), ['RB-001']);
  cek('ambang SLA terdokumentasi di metrik', typeof incidents.metrik([]).slaTargetMenit.CRITICAL, 'number');

  const mt = incidents.metrik([]);
  cek('tanpa riwayat: MTTR null (bukan angka karangan)', [mt.mttrMenit, mt.slaPersen, mt.catatan], [null, null, 'belum ada riwayat']);

  const mt2 = incidents.metrik([{ severity: 'HIGH', status: 'CLOSED', detectedAt: new Date(now - 3 * 3600e3).toISOString(), resolvedAt: new Date(now).toISOString() }]);
  cek('MTTR dihitung dari insiden nyata', mt2.mttrMenit, 180);
  cek('SLA dihitung dari target severity', [mt2.slaPersen, mt2.slaTotal], [100, 1]);

  console.log('\n==============================================');
  console.log('  ' + lulus + ' lulus, ' + gagal + ' gagal');
  console.log('==============================================');
  process.exit(gagal ? 1 : 0);
})().catch(e => {
  console.error('  GAGAL  uji insiden melempar galat:', e.message);
  process.exit(1);
});
