'use strict';
/**
 * Rute Operations Center.
 *
 * Dipisahkan dari server.js (yang sudah 2.500+ baris) supaya batas modulnya
 * jelas: berkas ini hanya menyusun respons dari modul-modul ops, tidak
 * menyentuh logika sumber hulu sama sekali.
 *
 * Konvensi yang dipertahankan dari server.js: balasan JSON, Cache-Control
 * eksplisit, dan galat tidak pernah membocorkan detail internal.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const scheduler = require('./scheduler-instance');
const health = require('./service-health');
const freshness = require('./freshness');
const alerts = require('./alert-engine');
const incidents = require('./incidents');
const runbooks = require('./runbooks');
const store = require('./ops-store');
const auth = require('./ops-auth');
const troubleshoot = require('./troubleshoot');
const analytics = require('./analytics');
const infraSim = require('./infra-sim');

/**
 * Penjaga tulis berbasis peran (lihat lib/ops-auth.js).
 *
 * `OPS_WRITE_TOKEN` lama tetap bekerja: ia diperlakukan sebagai token ADMIN.
 * Bila TIDAK ADA token yang dikonfigurasi, aplikasi berjalan dalam mode
 * terbuka, dan mode itu dikatakan lewat `/api/operations/access` serta di
 * antarmuka, supaya tidak ada yang menyangka dirinya sudah terkunci.
 */
const OPERATOR = auth.butuh(auth.MIN_TULIS);   // penanganan insiden
const ADMIN = auth.butuh(auth.MIN_EVALUASI);   // memicu pengambilan data hulu
const BACA = auth.baca();                      // publik kecuali OPS_READ_PROTECTED=1

function tulis(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

/**
 * Ukur sekarang bila instance ini belum pernah mengukur apa pun.
 *
 * Di Vercel setiap instance punya memori sendiri dan tugas penjadwal hanya
 * berjalan saat /api/cron memanggilnya (tiap 10 menit, dari GitHub Actions).
 * Akibatnya pengunjung yang mendarat di instance yang baru hidup melihat
 * sembilan sumber "belum diketahui", jujur, tetapi tidak berguna: yang
 * sebenarnya terjadi bukan "tidak ada data", melainkan "belum ada yang
 * mengukur di instance ini".
 *
 * Karena itu rute baca ops menjalankan SATU kali pengukuran beranggaran
 * terbatas ketika instance ini belum punya hasil apa pun. Yang ditampilkan
 * tetap angka hasil pengukuran sungguhan, bukan tebakan:
 *   - lokal            : tidak perlu (timer internal sudah mengukur)
 *   - sudah terukur    : tidak diulang
 *   - OPS_WARMUP_MS=0  : dimatikan
 *   - percobaan gagal  : diulang paling cepat 60 detik sekali agar sumber hulu
 *                        tidak dihujani permintaan
 */
let janjiUkur = null;
let terakhirUkur = 0;
const UKUR_JEDA_MS = 60000;

async function ukurBilaPerlu() {
  if (!process.env.VERCEL) return null;
  const budgetMs = Number(process.env.OPS_WARMUP_MS || 8000);
  if (!(budgetMs > 0)) return null;

  const st = scheduler.status();
  if (st.summary && st.summary.totalRuns > 0) return null;
  if (janjiUkur) return janjiUkur;
  if (Date.now() - terakhirUkur < UKUR_JEDA_MS) return null;

  terakhirUkur = Date.now();
  janjiUkur = Promise.resolve()
    .then(() => scheduler.tick({ budgetMs }))
    .then(r => ({ ran: true, budgetMs, ms: r.ms, diukur: r.refreshed.length, pending: r.pending.length }))
    .catch(() => ({ ran: true, budgetMs, gagal: true }))
    .then(hasil => { janjiUkur = null; return hasil; });
  return janjiUkur;
}

function sumberKontekstual() {
  const st = scheduler.status();
  const services = health.bangun(st);
  return { st, services };
}

module.exports = function pasang(app, deps) {
  const { clusterHotspots, getHotspots } = deps;

  // ---------- kesehatan ----------
  app.get('/api/operations/health', BACA, tulis(async (_req, res) => {
    const warmup = await ukurBilaPerlu();
    const { services } = sumberKontekstual();
    res.set('Cache-Control', 'no-store');
    res.json({
      checkedAt: new Date().toISOString(),
      summary: health.ringkas(services),
      application: Object.assign(health.aplikasi(store), warmup ? { warmup } : {}, {
        // Penanda build: membuktikan KODE versi mana yang sedang melayani.
        // Tanpa ini, "sudah deploy belum?" hanya bisa disimpulkan, dan
        // kesimpulan yang salah sudah dua kali menipu saya hari ini.
        build: process.env.VERCEL_GIT_COMMIT_SHA ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7) : null,
        lingkungan: process.env.VERCEL_ENV || null
      }),
      services
    });
  }));

  app.get('/api/data-sources', BACA, tulis(async (_req, res) => {
    const warmup = await ukurBilaPerlu();
    const { services } = sumberKontekstual();
    res.set('Cache-Control', 'no-store');
    res.json({
      checkedAt: new Date().toISOString(),
      thresholds: freshness.ambang(),
      warmup,
      sources: services.map(s => ({
        id: s.id, name: s.name, status: s.status, endpoint: s.endpoint,
        lastCheckedAt: s.lastCheckedAt, lastSuccessfulAt: s.lastSuccessfulAt,
        responseTime: s.responseTime, errorCount: s.errorCount,
        consecutiveFails: s.consecutiveFails, backoff: s.backoff,
        critical: s.critical,
        freshness: s.freshness,
        updateIntervalMs: (scheduler.status().tasks.find(t => t.id === s.id) || {}).everyMs || null,
        errorNote: s.errorNote
      }))
    });
  }));

  // ---------- alert ----------
  app.get('/api/alerts', BACA, tulis(async (req, res) => {
    const d = await store.read();
    let items = (d.alerts || []).slice().sort((a, b) => (a.detectedAt < b.detectedAt ? 1 : -1));
    if (req.query.status) items = items.filter(a => req.query.status.split(',').includes(a.status));
    res.set('Cache-Control', 'no-store');
    const kategoriAlert = r => r === 'source_down' ? 'data_source_unavailable'
      : r === 'data_critical' ? 'data_stale'
        : r === 'api_slow' ? 'api_performance' : 'environmental_event';
    res.json({
      alerts: items.map(a => Object.assign({}, a, { runbooks: runbooks.untukKategori(kategoriAlert(a.ruleId)) }))
    });
  }));

  /** Evaluasi manual, dipakai halaman dan oleh pengujian. */
  app.post('/api/operations/evaluate', ADMIN, tulis(async (_req, res) => {
    const { services } = sumberKontekstual();
    let clusters = [];
    try {
      const hs = await getHotspots();
      clusters = clusterHotspots((hs && hs.hotspots) || []);
    } catch (e) {
      clusters = []; // titik api tidak tersedia bukan alasan gagal menilai kesehatan
    }
    const hasil = await alerts.jalankan({ services, clusters });
    res.set('Cache-Control', 'no-store');
    res.json(Object.assign({ ok: true, evaluatedAt: new Date().toISOString() }, hasil));
  }));

  app.post('/api/alerts/:id/incident', OPERATOR, tulis(async (req, res) => {
    const r = await incidents.fromAlert(req.params.id, req.get('x-ops-actor') || null);
    res.status(r.created ? 201 : 200).json(r);
  }));

  // ---------- infrastruktur (SIMULATED) ----------
  // Angka hulu = pengukuran nyata; angka tautan = SIMULASI dan ditandai per
  // nilai (`simulated: true`), bukan pengukuran, bukan perangkat fisik.
  app.get('/api/operations/infra', BACA, tulis(async (_req, res) => {
    const { st, services } = sumberKontekstual();
    res.set('Cache-Control', 'no-store');
    res.json(infraSim.gambaran(services, {
      uptimeSeconds: process.uptime(),
      nodeVersion: process.version,
      storageMode: store.info().mode,
      serverless: !!process.env.VERCEL,
      schedulerMode: process.env.VERCEL ? 'penjadwal luar (GitHub Actions)' : 'timer internal'
    }));
  }));

  // ---------- analitik (P2) ----------
  // Tren dan rekap dihitung dari riwayat tersimpan. Bila belum ada riwayat,
  // balasannya menyatakan itu (`kosong: true`) alih-alih menyajikan grafik nol.
  app.get('/api/operations/analytics', BACA, tulis(async (req, res) => {
    const d = await store.read();
    res.set('Cache-Control', 'no-store');
    res.json(analytics.laporan(d.incidents || [], d.alerts || [], {
      audit: d.audit || [],
      hari: req.query.hari,
      target: incidents.targetSLA()
    }));
  }));

  // ---------- diagnosa berbasis bukti (P2) ----------
  // Tiga sasaran: satu layanan, satu alert, satu insiden. Balasannya selalu
  // memuat BUKTI angka; modulnya tidak pernah menebak tanpa bukti.
  app.get('/api/operations/diagnose', BACA, tulis(async (req, res) => {
    // Pengukuran saat instance dingin berlaku di sini juga: tanpa itu, panggilan
    // API langsung ke rute ini menjawab "belum terukur" padahal pengukuran bisa
    // dijalankan. Diagnosa atas data yang belum diukur bukan diagnosa.
    await ukurBilaPerlu();
    const { st, services } = sumberKontekstual();
    const d = await store.read();
    const aktif = (d.alerts || []).filter(a => a.status === 'ACTIVE');
    const target = String(req.query.service || req.query.alert || req.query.incident || '').trim();

    let svc = null;
    let viaAlert = null;
    let viaInsiden = null;

    if (req.query.alert) {
      viaAlert = (d.alerts || []).find(a => a.id === req.query.alert) || null;
      if (viaAlert && viaAlert.serviceId) svc = services.find(s => s.id === viaAlert.serviceId) || null;
    } else if (req.query.incident) {
      viaInsiden = (d.incidents || []).find(i => i.incidentId === req.query.incident) || null;
      if (viaInsiden && viaInsiden.serviceId) svc = services.find(s => s.id === viaInsiden.serviceId) || null;
    } else if (req.query.service) {
      svc = services.find(s => s.id === req.query.service) || null;
    }

    if (!svc && !viaAlert && !viaInsiden) {
      // Tanpa sasaran yang dikenal: balas ringkasan armada, bukan galat -
      // operator sering ingin tahu "apa yang paling perlu dilihat sekarang".
      res.set('Cache-Control', 'no-store');
      return res.json({ mode: 'armada', ...troubleshoot.ringkas(services, aktif, { slowMs: alerts.SLOW_MS }) });
    }

    const runbookIds = [];
    const kategori = viaAlert ? troubleshoot.KATEGORI_ALERT[viaAlert.ruleId]
      : (viaInsiden ? viaInsiden.category : troubleshoot.kategoriUntuk(svc, aktif));
    if (kategori) runbooks.untukKategori(kategori).forEach(r => runbookIds.push(r.id + ' ' + r.title));

    const hasil = svc
      ? troubleshoot.diagnosaLayanan(svc, { runbook: runbookIds, slowMs: alerts.SLOW_MS })
      : {
        sasaran: { jenis: viaInsiden ? 'insiden' : 'alert', id: viaInsiden ? viaInsiden.incidentId : viaAlert.id },
        kesimpulan: 'Sasaran ini tidak menunjuk layanan tertentu, sehingga diagnosa per-layanan tidak berlaku.',
        keyakinan: { tingkat: 'rendah', alasan: 'tidak ada layanan terkait' },
        bukti: [
          'alert=' + (viaAlert ? viaAlert.id + ' (' + viaAlert.ruleId + ')' : '-'),
          'insiden=' + (viaInsiden ? viaInsiden.incidentId + ' (' + viaInsiden.category + ', ' + viaInsiden.status + ')' : '-')
        ],
        dugaan: [{
          judul: viaInsiden && viaInsiden.category === 'environmental_event'
            ? 'Kejadian lingkungan, bukan kegagalan sistem'
            : 'Belum menunjuk layanan tertentu',
          sebab: viaInsiden && viaInsiden.category === 'environmental_event'
            ? 'Kategori insiden ini kejadian alam (mis. klaster titik api). Sistem pemantauannya bekerja; yang perlu ditangani kejadiannya.'
            : 'Tidak ada serviceId pada sasaran ini, jadi tidak ada pengukuran layanan yang bisa dipakai sebagai bukti.',
          langkah: kategori ? ['Ikuti runbook terkait di bawah.'] : ['Buat insiden dari alert yang punya serviceId agar diagnosa per-layanan tersedia.']
        }],
        runbook: runbookIds
      };

    hasil.jenis = 'berbasis-bukti';
    hasil.dasar = 'Aturan tetap atas pengukuran tersimpan, bukan keluaran model bahasa.';
    hasil.alertTerkait = aktif.filter(a => svc && a.serviceId === svc.id).map(a => a.id);
    hasil.insidenTerbuka = (d.incidents || []).filter(i => svc && i.serviceId === svc.id && i.status !== 'CLOSED').map(i => i.incidentId);
    res.set('Cache-Control', 'no-store');
    res.json(hasil);
  }));

  // ---------- akses (RBAC) ----------
  // Menyatakan mode akses apa adanya: peran mana yang terkonfigurasi, apakah
  // baca dikunci, dan peran Anda sendiri. Token TIDAK pernah dikembalikan.
  app.get('/api/operations/access', tulis(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(auth.info(auth.peranDariToken(req.get('x-ops-token'))));
  }));

  /**
   * Alarm untuk monitor luar (status HTTP, bukan JSON yang harus ditafsirkan).
   * 200 = normal, 503 = ada yang perlu ditangani. Isi balasannya menyebut APA
   * yang gagal supaya surel alarmnya bisa langsung ditindaklanjuti.
   */
  app.get('/api/alarm', BACA, tulis(async (_req, res) => {
    await ukurBilaPerlu();            // instance dingin mengukur dulu, agar penilaian bermakna
    const { services } = sumberKontekstual();
    const a = health.alarm(services);
    res.set('Cache-Control', 'no-store');
    res.status(a.ok ? 200 : 503).json(Object.assign({ checkedAt: new Date().toISOString() }, a));
  }));

  // ---------- log audit ----------
  // Jejak siapa mengubah apa. Sumbernya SATU dokumen yang sama dengan insiden
  // dan alert, jadi tidak ada log kedua yang bisa berbeda dari kenyataan.
  app.get('/api/operations/audit', BACA, tulis(async (req, res) => {
    const a = await store.audit(req.query.limit);
    res.set('Cache-Control', 'no-store');
    res.json({ checkedAt: new Date().toISOString(), total: a.total, max: a.max, entries: a.entries });
  }));

  // ---------- insiden ----------
  app.get('/api/incidents', BACA, tulis(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ incidents: await incidents.list(req.query) });
  }));

  app.post('/api/incidents', OPERATOR, tulis(async (req, res) => {
    const inc = await incidents.create(req.body || {}, req.get('x-ops-actor') || null);
    res.status(201).json(inc);
  }));

  app.get('/api/incidents/:id', tulis(async (req, res) => {
    const inc = await incidents.get(req.params.id);
    res.set('Cache-Control', 'no-store');
    res.json(Object.assign({}, inc, { runbooks: runbooks.untukKategori(inc.category) }));
  }));

  app.patch('/api/incidents/:id', OPERATOR, tulis(async (req, res) => {
    res.json(await incidents.patch(req.params.id, req.body || {}, req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/escalate', OPERATOR, tulis(async (req, res) => {
    res.json(await incidents.escalate(req.params.id, req.body || {}, req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/resolve', OPERATOR, tulis(async (req, res) => {
    res.json(await incidents.patch(req.params.id, { status: 'RESOLVED', resolution: (req.body || {}).resolution },
      req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/close', OPERATOR, tulis(async (req, res) => {
    res.json(await incidents.patch(req.params.id, { status: 'CLOSED' }, req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/notes', OPERATOR, tulis(async (req, res) => {
    const note = (req.body || {}).note;
    if (!note || !String(note).trim()) return res.status(400).json({ error: 'Catatan tidak boleh kosong.' });
    res.json(await incidents.patch(req.params.id, { note: String(note) },
      req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/assign', OPERATOR, tulis(async (req, res) => {
    const to = (req.body || {}).assignedTo;
    if (!to || !String(to).trim()) return res.status(400).json({ error: 'Nama penanggung jawab wajib diisi.' });
    res.json(await incidents.patch(req.params.id, { assignedTo: String(to) },
      req.get('x-ops-actor') || null));
  }));

  // ---------- runbook ----------
  app.get('/api/runbooks', BACA, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ runbooks: runbooks.list() });
  });

  app.get('/api/runbooks/:id', (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(runbooks.get(req.params.id));
    } catch (e) {
      res.status(e.statusCode || 500).json({ error: e.message });
    }
  });

  // ---------- metrik & penyimpanan ----------
  app.get('/api/operations/metrics', BACA, tulis(async (_req, res) => {
    const d = await store.read();
    res.set('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      metrics: incidents.metrik(d.incidents || []),
      counts: { incidents: (d.incidents || []).length, alerts: (d.alerts || []).length },
      storage: store.info()
    });
  }));

  app.get('/api/operations/store', BACA, tulis(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const info = store.info();
    // ?uji=1 = panggil penyimpanan SEKARANG dan laporkan langkah mana yang
    // gagal (beserta kode status hulu). Tanpa ini, kegagalan penyimpanan di
    // produksi hanya terlihat sebagai "kesalahan internal" tanpa sebab.
    if (String(req.query.uji || '') === '1') {
      if (store.mode === 'github') {
        info.uji = await require('./ops-github').uji();
      } else if (store.mode === 'upstash') {
        try {
          await store.read();
          info.uji = { ok: true, langkah: 'baca', mode: 'upstash', alasan: store.lastError ? store.lastError : 'Pembacaan berhasil.' };
        } catch (e) {
          info.uji = { ok: false, langkah: 'baca', mode: 'upstash', alasan: String(e.message).slice(0, 160) };
        }
      } else {
        info.uji = { ok: true, langkah: 'tidak perlu jaringan', mode: store.mode,
          alasan: 'Mode ini tidak memakai layanan luar, jadi tidak ada yang bisa gagal di jaringan.' };
      }
    }
    res.json(info);
  }));

  // Halaman operasi, satu halaman statis, skrip & gayanya berkas sendiri
  // (CSP 'self' tidak perlu dilonggarkan).
  // Lembar insiden tersendiri: /insiden/INC-2026-00001
  // Satu insiden, satu alamat, tanpa panel lain, untuk dibagikan dan dibaca
  // ulang. Isinya dirender berkas bersama (public/ops-detail.js), jadi tidak
  // ada perilaku kedua yang bisa berbeda dari papan operasi.
  // Id TIDAK divalidasi di sini: halaman yang menyatakan "tidak ditemukan"
  // secara apa adanya lebih jujur daripada 404 tanpa keterangan.
  app.get('/insiden/:id', (_req, res) => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'insiden.html'), 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.send(html);
  });

  app.get('/operations', (_req, res) => {
    // Dibaca dari berkas dengan pola yang sama seperti halaman utama:
    // berkas masuk daftar includeFiles Vercel (public/**), jadi tidak hilang
    // di produksi, kelas bug yang memang pernah terjadi di proyek ini.
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'operations.html'), 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.send(html);
  });

  app.use((err, req, res, next) => {
    if (!req.path.startsWith('/api/')) return next(err);
    const kode = err.statusCode || 500;
    if (kode >= 500) console.error('[ops]', err.message);
    // Galat penyimpanan tidak boleh disembunyikan di balik kalimat umum:
    // bila penyebabnya diketahui, ikutkan (status hulu + sebab) supaya bisa
    // ditindaklanjuti. Tidak pernah memuat token.
    const badan = { error: kode >= 500 ? 'Kesalahan internal pada modul operasional.' : err.message };
    if (err.gagalPenyimpanan) badan.penyimpanan = store.info();
    if (kode >= 500) console.error('[ops]', err.message);
    res.status(kode).json(badan);
  });
};

// Diekspor untuk diuji: perilaku pengukuran-saat-diminta harus bisa
// dibuktikan tanpa instance Vercel sungguhan (lihat scripts/test-ops.js).
module.exports.ukurBilaPerlu = ukurBilaPerlu;
