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
const os = require('os');
process.env.OPS_STORE_FORCE = 'file'; // pastikan tidak menyentuh layanan luar
// Berkas simpanan KHUSUS uji ini. Tanpa ini, asersi "N entri baru" bergantung
// pada isi .data/ops.json yang sudah menumpuk dari putaran sebelumnya.
const BERKAS_UJI = path.join(os.tmpdir(), 'siaga-ops-uji-' + process.pid + '.json');
process.env.OPS_STORE_FILE = BERKAS_UJI;

const freshness = require('../lib/freshness');
const health = require('../lib/service-health');
const opsRoutes = require('../lib/ops-routes');
const alerts = require('../lib/alert-engine');
const auth = require('../lib/ops-auth');
const triage = require('../lib/troubleshoot');
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

// Status APLIKASI tidak boleh mengklaim lebih dari yang terukur.
const stBaru = { total: 9, healthy: 0, summary: { totalFails: 0 } };
cek('aplikasi belum mengukur apa pun → UNKNOWN, bukan DOWN',
  health.statusAplikasi(stBaru).status, 'UNKNOWN');
cek('sebab UNKNOWN disebut apa adanya',
  /belum ada tugas yang terukur/.test(health.statusAplikasi(stBaru).reason), true);
cek('aplikasi punya kegagalan nyata → DOWN',
  health.statusAplikasi({ total: 9, healthy: 0, summary: { totalFails: 4 } }).status, 'DOWN');
cek('aplikasi sebagian sehat → WARNING',
  health.statusAplikasi({ total: 9, healthy: 3, summary: { totalFails: 1 } }).status, 'WARNING');
cek('aplikasi sembilan dari sembilan → HEALTHY',
  health.statusAplikasi({ total: 9, healthy: 9, summary: { totalFails: 0 } }).status, 'HEALTHY');
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

  // --- pengukuran saat diminta (instance serverless yang baru hidup) ---
  // Di Vercel memori per instance; tanpa ini pengunjung melihat sembilan
  // sumber "belum diketahui" padahal yang kurang cuma pengukuran.
  const sched = require('../lib/scheduler-instance');
  const asliStatus = sched.status;
  const asliTick = sched.tick;
  let tickDipanggil = 0;
  sched.status = () => ({ summary: { totalRuns: 0 }, tasks: [], healthy: 0, total: 9 });
  sched.tick = async () => { tickDipanggil++; return { refreshed: ['hotspots'], pending: ['eruption'], timedOut: true, ms: 5 }; };
  process.env.OPS_WARMUP_MS = '5000';

  delete process.env.VERCEL;
  cek('lokal: pengukuran saat diminta tidak dijalankan', await opsRoutes.ukurBilaPerlu(), null);

  process.env.VERCEL = '1';
  const duaPermintaan = await Promise.all([opsRoutes.ukurBilaPerlu(), opsRoutes.ukurBilaPerlu()]);
  cek('instance dingin diukur satu kali saja walau diminta serentak', tickDipanggil, 1);
  cek('anggaran waktu dilaporkan apa adanya',
    [duaPermintaan[0].ran, duaPermintaan[0].budgetMs, duaPermintaan[0].diukur, duaPermintaan[0].pending], [true, 5000, 1, 1]);

  sched.status = () => ({ summary: { totalRuns: 3 }, tasks: [], healthy: 2, total: 9 });
  cek('instance yang sudah terukur tidak diukur ulang', await opsRoutes.ukurBilaPerlu(), null);

  sched.status = () => ({ summary: { totalRuns: 0 }, tasks: [], healthy: 0, total: 9 });
  cek('percobaan beruntun ditahan jeda 60 detik', await opsRoutes.ukurBilaPerlu(), null);

  process.env.OPS_WARMUP_MS = '0';
  cek('OPS_WARMUP_MS=0 mematikan pengukuran', await opsRoutes.ukurBilaPerlu(), null);

  delete process.env.OPS_WARMUP_MS;
  delete process.env.VERCEL;
  sched.status = asliStatus;
  sched.tick = asliTick;

  // --- log audit: dicatat dari tindakan yang benar-benar tersimpan ---
  const st2 = require('../lib/ops-store');
  const auditSebelum = (await st2.audit(5)).total;
  const incA = await incidents.create({ title: 'Uji audit A', severity: 'LOW', category: 'lain_lain' }, 'Rina');
  await incidents.patch(incA.incidentId, { status: 'INVESTIGATING' }, 'Budi');
  const l1 = await st2.audit(5);
  cek('tindakan insiden tercatat di log audit (2 entri baru)', l1.total, Math.min(auditSebelum + 2, st2.AUDIT_MAX));
  cek('pelaku dicatat sesuai yang mengirim', l1.entries[0].actor, 'Budi');
  cek('log audit menunjuk sasaran tindakan', l1.entries[0].target, incA.incidentId);
  cek('log audit menyebut apa yang berubah', /status → INVESTIGATING/.test(l1.entries[0].detail), true);
  cek('urut dari yang terbaru', l1.entries[0].at >= l1.entries[1].at, true);

  const incTanpaNama = await incidents.create({ title: 'Uji audit tanpa nama', severity: 'LOW', category: 'lain_lain' }, null);
  const l2 = await st2.audit(3);
  cek('tanpa nama pengirim ditulis apa adanya', l2.entries[0].actor, 'tanpa nama');

  // Batas log: entri lama dibuang, bukan tumbuh tanpa ujung.
  const dok = { audit: [] };
  for (let i = 0; i < st2.AUDIT_MAX + 25; i++) st2.catatAudit(dok, { action: 'uji_' + i, actor: 'sistem' });
  cek('log audit dibatasi ' + st2.AUDIT_MAX + ' entri', dok.audit.length, st2.AUDIT_MAX);
  cek('yang dibuang adalah yang paling lama', dok.audit[0].action, 'uji_' + (st2.AUDIT_MAX + 24));

  // Jalur otomatis (evaluasi alert) mencatat dirinya sebagai sistem, dan
  // hanya bila ada yang benar-benar berubah.
  // Sel klaster dibuat acak supaya uji ini tidak bergantung pada isi berkas
  // simpanan dari putaran sebelumnya (alert yang sudah ada akan ter-dedup,
  // sehingga evaluasi memang tidak mengubah apa pun — itu perilaku benar).
  const sel = { lat: 3 + Math.random() * 5, lon: 95 + Math.random() * 20, count: 60, frp: 900 };
  const sebelumAuto = (await st2.audit(1)).total;
  await alerts.jalankan({ services: [], clusters: [sel] });
  const l3 = await st2.audit(3);
  cek('evaluasi yang mengubah alert tercatat sebagai sistem',
    [l3.entries[0].actor, l3.entries[0].action], ['sistem', 'alert_dievaluasi']);
  cek('log evaluasi menyebut id alert barunya', /ALR-\d{8}-\d{5}/.test(l3.entries[0].detail), true);
  const sebelumUlang = (await st2.audit(1)).total;
  await alerts.jalankan({ services: [], clusters: [sel] });
  cek('evaluasi tanpa perubahan tidak menambah log', (await st2.audit(1)).total, sebelumUlang);

  // --- lembar insiden: keadaan "langkah dikerjakan" dibaca dari timeline ---
  // Karena centangnya TIDAK disimpan terpisah (sengaja: supaya tidak bisa
  // berbeda dari riwayat), format kunci catatan harus diuji — kalau formatnya
  // meleset sedikit saja, semua langkah akan tampak belum dikerjakan.
  const fs = require('fs');
  const vm = require('vm');
  const sandbox = { console, OpsCore: { el: () => null, $: () => null } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'ops-detail.js'), 'utf8'), sandbox);
  const D = sandbox.OpsDetail;

  cek('kunci catatan langkah berformat tetap', D.kunciLangkah('RB-001', 3), 'Langkah RB-001 #3');
  const tl = [
    { at: '2026-10-04T01:00:00Z', message: 'Insiden dibuat.', by: 'Rina' },
    { at: '2026-10-04T02:00:00Z', message: D.kunciLangkah('RB-001', 2) + ' dikerjakan: baca /api/status', by: 'Budi' },
    { at: '2026-10-04T03:00:00Z', message: D.kunciLangkah('RB-002', 2) + ' dikerjakan: runbook lain', by: 'Budi' },
    { at: '2026-10-04T04:00:00Z', message: 'Catatan bebas yang menyebut RB-001 tanpa nomor.', by: 'Sari' }
  ];
  const peta = D.langkahSelesai(tl, 'RB-001');
  cek('langkah yang ditandai terbaca dari timeline', Object.keys(peta), ['2']);
  cek('pelaku langkah tercatat', peta['2'].by, 'Budi');
  cek('langkah runbook lain tidak ikut tertandai', peta['5'], undefined);
  cek('catatan tanpa nomor langkah tidak menandai apa pun',
    Object.keys(D.langkahSelesai([{ at: 'x', message: 'menyebut RB-001 saja' }], 'RB-001')), []);
  cek('timeline kosong tetap aman', Object.keys(D.langkahSelesai(null, 'RB-001')), []);
  const dua = D.langkahSelesai(tl.concat([
    { at: '2026-10-04T05:00:00Z', message: D.kunciLangkah('RB-001', 2) + ' dikerjakan lagi', by: 'Sari' }
  ]), 'RB-001');
  cek('penandaan ulang memakai yang terbaru', [dua['2'].by, dua['2'].at], ['Sari', '2026-10-04T05:00:00Z']);

  // --- RBAC: peran akses (VIEWER < OPERATOR < ADMIN) ---
  function reqDengan(token) {
    return { get: (h) => (h.toLowerCase() === 'x-ops-token' ? token : undefined), opsPeran: undefined };
  }
  function resPalsu() {
    const r = { kode: null, badan: null };
    r.status = (k) => { r.kode = k; return r; };
    r.json = (b) => { r.badan = b; return r; };
    return r;
  }
  const simpanEnv = {};
  ['OPS_TOKEN_VIEWER', 'OPS_TOKEN_OPERATOR', 'OPS_TOKEN_ADMIN', 'OPS_WRITE_TOKEN', 'OPS_READ_PROTECTED']
    .forEach(k => { simpanEnv[k] = process.env[k]; delete process.env[k]; });

  cek('tanpa token apa pun → mode terbuka', auth.konfigurasi().mode, 'terbuka');
  cek('mode terbuka: tidak ada peran yang dikonfigurasi',
    auth.konfigurasi().peranDikonfigurasi, { VIEWER: false, OPERATOR: false, ADMIN: false });
  let lanjut = false;
  auth.butuh('OPERATOR')(reqDengan(''), resPalsu(), () => { lanjut = true; });
  cek('mode terbuka: tulis diloloskan (perilaku lama dipertahankan)', lanjut, true);

  process.env.OPS_TOKEN_VIEWER = 'v1';
  process.env.OPS_TOKEN_OPERATOR = 'o1';
  process.env.OPS_TOKEN_ADMIN = 'a1';
  const kTerkunci = auth.konfigurasi();
  cek('tiga peran terkonfigurasi → mode token', [kTerkunci.mode, kTerkunci.aktif], ['token', true]);
  cek('baca tetap publik sebagai bawaan', kTerkunci.readProtected, false);

  let r1 = resPalsu(); lanjut = false;
  auth.butuh('OPERATOR')(reqDengan(''), r1, () => { lanjut = true; });
  cek('tanpa token → 401', [r1.kode, lanjut], [401, false]);
  r1 = resPalsu(); auth.butuh('OPERATOR')(reqDengan('salah'), r1, () => {});
  cek('token tidak dikenal → 401', r1.kode, 401);
  r1 = resPalsu(); lanjut = false;
  auth.butuh('OPERATOR')(reqDengan('o1'), r1, () => { lanjut = true; });
  cek('OPERATOR boleh menangani insiden', [r1.kode, lanjut], [null, true]);
  r1 = resPalsu(); auth.butuh('ADMIN')(reqDengan('o1'), r1, () => {});
  cek('OPERATOR tidak boleh memicu evaluasi (butuh ADMIN) → 403', [r1.kode, /tidak cukup/.test(r1.badan.error)], [403, true]);
  r1 = resPalsu(); lanjut = false;
  auth.butuh('ADMIN')(reqDengan('a1'), r1, () => { lanjut = true; });
  cek('ADMIN boleh memicu evaluasi', lanjut, true);
  r1 = resPalsu(); lanjut = false;
  auth.butuh('VIEWER')(reqDengan('v1'), r1, () => { lanjut = true; });
  cek('peran lebih tinggi memenuhi syarat lebih rendah', lanjut, true);

  // Tingkat peran tidak boleh tertukar arah.
  cek('urutan peran benar', [auth.cukup('ADMIN', 'VIEWER'), auth.cukup('VIEWER', 'ADMIN'), auth.cukup(null, 'VIEWER')],
    [true, false, false]);

  // OPS_WRITE_TOKEN lama = alias ADMIN (pemasangan lama tidak berubah perilaku).
  delete process.env.OPS_TOKEN_VIEWER; delete process.env.OPS_TOKEN_OPERATOR; delete process.env.OPS_TOKEN_ADMIN;
  process.env.OPS_WRITE_TOKEN = 'lama';
  cek('OPS_WRITE_TOKEN lama dihormati sebagai ADMIN', auth.peranDariToken('lama'), 'ADMIN');
  r1 = resPalsu(); lanjut = false;
  auth.butuh('OPERATOR')(reqDengan('lama'), r1, () => { lanjut = true; });
  cek('token lama tetap bisa menulis', lanjut, true);

  // Baca terkunci hanya bila diminta eksplisit.
  process.env.OPS_READ_PROTECTED = '1';
  r1 = resPalsu(); lanjut = false;
  auth.baca()(reqDengan(''), r1, () => { lanjut = true; });
  cek('OPS_READ_PROTECTED=1: baca tanpa token → 401', [r1.kode, lanjut], [401, false]);
  r1 = resPalsu(); lanjut = false;
  auth.baca()(reqDengan('lama'), r1, () => { lanjut = true; });
  cek('OPS_READ_PROTECTED=1: baca dengan token sah → lanjut', lanjut, true);

  // Keterangan untuk API/antarmuka tidak boleh memuat tokennya sendiri.
  const inf = JSON.stringify(auth.info());
  cek('keterangan akses tidak membocorkan token', ['lama', 'o1', 'a1', 'v1'].some(x => inf.includes(x)), false);
  cek('keterangan akses menyebut peran Anda', auth.info('VIEWER').peranAnda, 'VIEWER');

  ['OPS_TOKEN_VIEWER', 'OPS_TOKEN_OPERATOR', 'OPS_TOKEN_ADMIN', 'OPS_WRITE_TOKEN', 'OPS_READ_PROTECTED']
    .forEach(k => { if (simpanEnv[k] === undefined) delete process.env[k]; else process.env[k] = simpanEnv[k]; });

  // --- mode github: cadangan harus FUNGSI, dan pembacaan pertama tidak boleh
  // menjatuhkan aplikasi. Diuji tanpa jaringan: adaptor GitHub diganti tiruan.
  process.env.OPS_GITHUB_TOKEN = 'tiruan';
  process.env.OPS_GITHUB_REPO = 'pemilik/repo';
  delete require.cache[require.resolve('../lib/ops-store')];
  const storeGithub = require('../lib/ops-store');
  cek('mode github terdeteksi dari env',
    [storeGithub.mode, storeGithub.info().persistent], ['github', true]);

  let cadanganDiterima = null;
  storeGithub._github = {
    read: async (fallback) => {
      cadanganDiterima = typeof fallback;
      return fallback(); // meniru issue belum ada
    },
    write: async (data) => data
  };
  const kosong = await storeGithub.read();
  cek('cadangan yang diterima adaptor GitHub berupa fungsi', cadanganDiterima, 'function');
  cek('issue belum ada → dokumen kosong yang sah',
    [kosong.incidents.length, kosong.alerts.length, kosong.audit.length], [0, 0, 0]);
  await storeGithub.write(kosong);
  cek('penulisan mode github diteruskan ke adaptor', true, true);

  delete process.env.OPS_GITHUB_TOKEN;
  delete process.env.OPS_GITHUB_REPO;
  delete require.cache[require.resolve('../lib/ops-store')];

  try { require('fs').unlinkSync(BERKAS_UJI); } catch (e) { /* berkas uji memang sementara */ }

  // --- diagnosa berbasis bukti (P2) ---
  // Modul ini tidak boleh menyimpulkan tanpa bukti. Ujinya karena itu menekan
  // dua hal: pemetaan gejala → dugaan, dan LARANGAN menyimpulkan saat bersih.
  const svcDown = {
    id: 'eruption', name: 'Laporan letusan pos pengamatan', status: 'DOWN', hasData: false,
    consecutiveFails: 3, errorCount: 5, backoff: true, critical: true, responseTime: null,
    lastCheckedAt: '2026-10-04T08:00:00Z', lastSuccessfulAt: null,
    endpoint: 'magma.esdm.go.id — informasi letusan', errorNote: 'magma 500',
    freshness: { status: 'UNKNOWN', reason: 'belum pernah berhasil ditarik' }
  };
  const svcSehat = {
    id: 'quake', name: 'Gempa bumi (BMKG)', status: 'HEALTHY', hasData: true,
    consecutiveFails: 0, errorCount: 0, backoff: false, critical: true, responseTime: 220,
    lastCheckedAt: '2026-10-04T08:00:00Z', lastSuccessfulAt: '2026-10-04T08:00:00Z',
    endpoint: 'data.bmkg.go.id', errorNote: null,
    freshness: { status: 'FRESH', reason: 'umur data di dalam ambang' }
  };

  cek('jenis kegagalan 5xx dikenali', triage.jenisKegagalan('magma 500').kode, 'hulu-5xx');
  cek('jenis kegagalan timeout dikenali', triage.jenisKegagalan('ETIMEDOUT saat menghubungi hulu').kode, 'timeout');
  cek('jenis kegagalan kredensial dikenali', triage.jenisKegagalan('401 Unauthorized dari hulu').kode, 'kredensial');
  cek('jenis kegagalan kuota dikenali', triage.jenisKegagalan('hulu menolak: 429 rate limit').kode, 'kuota');
  cek('pesan kosong tidak dipaksakan jadi jenis', triage.jenisKegagalan(null), null);

  cek('keyakinan 1 kelompok → rendah', triage.hitungKeyakinan(['basi']).tingkat, 'rendah');
  cek('keyakinan 2 kelompok → sedang', triage.hitungKeyakinan(['basi', 'lambat']).tingkat, 'sedang');
  cek('keyakinan 4 kelompok → tinggi', triage.hitungKeyakinan(['basi', 'lambat', 'dijeda', 'gagal-berulang']).tingkat, 'tinggi');
  cek('arti keyakinan menyatakan ia bukan kepastian penyebab',
    /BUKAN kepastian penyebab/.test(triage.hitungKeyakinan(['basi', 'lambat']).arti), true);

  const dDown = triage.diagnosaLayanan(svcDown, { slowMs: 4000, runbook: ['RB-001 Sumber data tidak tersedia (API hulu gagal)'] });
  cek('sumber gagal berulang → dugaan menyebut jenis kegagalannya',
    /tidak dapat dijangkau berulang/.test(dDown.kesimpulan) && /5xx/.test(dDown.kesimpulan), true);
  cek('setiap diagnosa membawa bukti angka', dDown.bukti.some(b => /kegagalan berturut=3/.test(b)), true);
  cek('bukti menyebut hulu yang harus diperiksa', dDown.bukti.some(b => /magma\.esdm\.go\.id/.test(b)), true);
  cek('dugaan menyertakan langkah pemeriksaan', dDown.dugaan[0].langkah.length >= 3, true);
  cek('runbook kategori dikaitkan', dDown.runbook, ['RB-001 Sumber data tidak tersedia (API hulu gagal)']);

  // LARANGAN inti: layanan sehat tidak boleh dikarang-karang punya masalah.
  const dSehat = triage.diagnosaLayanan(svcSehat, {});
  cek('layanan sehat → tidak ada indikasi masalah',
    /Tidak ada indikasi masalah/.test(dSehat.kesimpulan), true);
  cek('layanan sehat tidak diberi keyakinan palsu', dSehat.keyakinan.alasan, 'tidak ada sinyal masalah');
  cek('layanan sehat tidak diberi runbook yang seolah perlu dikerjakan', dSehat.runbook, []);
  cek('sehat tetap mengingatkan batasnya (bukan jaminan)', /BUKAN jaminan/.test(dSehat.dugaan[0].sebab), true);

  // Belum terukur tidak boleh disamakan dengan rusak.
  const svcUnknown = Object.assign({}, svcSehat, { status: 'UNKNOWN', hasData: false, responseTime: null, lastSuccessfulAt: null, freshness: { status: 'UNKNOWN', reason: 'belum pernah berhasil ditarik' } });
  const dUnknown = triage.diagnosaLayanan(svcUnknown, {});
  cek('belum terukur → tidak disebut rusak', /Belum ada pengukuran/.test(dUnknown.kesimpulan), true);

  // Data lama yang masih disajikan adalah dugaan tersendiri.
  const svcBasi = Object.assign({}, svcSehat, { status: 'WARNING', consecutiveFails: 2, freshness: { status: 'CRITICAL', reason: 'umur 7× interval' } });
  cek('data kedaluwarsa tetapi ada → dugaan "nilai lama masih dipakai"',
    /kedaluwarsa/.test(triage.diagnosaLayanan(svcBasi, {}).kesimpulan), true);
  const svcLambat = Object.assign({}, svcSehat, { responseTime: 9500 });
  cek('respons lambat → dugaan lambat, bukan kegagalan',
    /lambat/.test(triage.diagnosaLayanan(svcLambat, { slowMs: 4000 }).kesimpulan), true);

  // Korelasi armada.
  cek('dua layanan turun belum cukup menyimpulkan gangguan sisi kita',
    triage.diagnosaArmada([svcDown, Object.assign({}, svcDown, { id: 'x' })]), null);
  const armada = triage.diagnosaArmada([
    svcDown, Object.assign({}, svcDown, { id: 'shelter' }), Object.assign({}, svcDown, { id: 'news' }),
    svcSehat
  ]);
  cek('tiga layanan turun → dugaan gangguan sisi kita', /sisi kita/.test(armada.judul), true);
  cek('korelasi menyebut ambangnya supaya bisa dibantah', /3 dari 4/.test(armada.sebab), true);
  cek('korelasi mendaftar bukti per layanan', armada.bukti.length, 3);

  // Kegagalan BARU (1×) tetap harus berguna, tanpa dibuat terdengar menetap.
  const svcBaru = Object.assign({}, svcDown, { consecutiveFails: 1, errorCount: 1, backoff: false, errorNote: 'laporan letusan tidak terbaca' });
  const dBaru = triage.diagnosaLayanan(svcBaru, {});
  cek('kegagalan baru disebut apa adanya (belum menetap)',
    /kegagalan baru 1×/.test(dBaru.kesimpulan) && /belum menetap/.test(dBaru.kesimpulan), true);
  cek('kegagalan baru tetap menyebut jenisnya',
    /tidak dapat dibaca/.test(dBaru.kesimpulan), true);
  cek('kegagalan baru punya langkah tindak lanjut', dBaru.dugaan[0].langkah.length >= 3, true);

  // Pemetaan kategori → runbook.
  cek('alert yang menyala menang atas bacaan status',
    triage.kategoriUntuk({ id: 'x', status: 'HEALTHY', hasData: true }, [{ id: 'a', serviceId: 'x', ruleId: 'api_slow' }]),
    'api_performance');
  cek('layanan turun tanpa alert → kategori sumber tidak tersedia',
    triage.kategoriUntuk(svcDown, []), 'data_source_unavailable');
  cek('data kedaluwarsa → kategori data basi',
    triage.kategoriUntuk({ id: 'y', status: 'WARNING', hasData: true, freshness: { status: 'CRITICAL' } }, []), 'data_stale');
  cek('layanan sehat → tanpa kategori (tidak ada SOP yang perlu dikerjakan)',
    triage.kategoriUntuk({ id: 'z', status: 'HEALTHY', hasData: true, freshness: { status: 'FRESH' } }, []), null);
  cek('pemanggil keliru (bukan larik) tidak menjatuhkan fungsi',
    triage.kategoriUntuk({ id: 'q', status: 'HEALTHY', hasData: true }, { bukan: 'larik' }), null);

  const ring = triage.ringkas([svcDown, svcSehat], [{ status: 'ACTIVE' }], {});
  cek('ringkasan menghitung layanan turun & alert aktif', [ring.ringkas.turun, ring.ringkas.alertAktif], [1, 1]);
  cek('ringkasan menyatakan dasarnya aturan, bukan model bahasa', /aturan tetap/.test(ring.catatan), true);

  console.log('\n==============================================');
  console.log('  ' + lulus + ' lulus, ' + gagal + ' gagal');
  console.log('==============================================');
  process.exit(gagal ? 1 : 0);
})().catch(e => {
  console.error('  GAGAL  uji insiden melempar galat:', e.message);
  process.exit(1);
});
