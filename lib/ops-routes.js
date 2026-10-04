'use strict';
/**
 * Rute Operations Center.
 *
 * Dipisahkan dari server.js (yang sudah 2.500+ baris) supaya batas modulnya
 * jelas: berkas ini hanya menyusun respons dari modul-modul ops — tidak
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

/**
 * Penjaga tulis opsional.
 * Bila OPS_WRITE_TOKEN dipasang, semua perubahan data operasional harus
 * menyertakan header x-ops-token. Bila tidak dipasang, operasi tetap berjalan
 * (mode demo publik) dan hal itu dinyatakan di /api/operations/store supaya
 * tidak ada yang menyangka sudah terkunci.
 */
function penjagaTulis(req, res, next) {
  const token = (process.env.OPS_WRITE_TOKEN || '').trim();
  if (!token) return next();
  if (String(req.get('x-ops-token') || '') !== token) {
    return res.status(401).json({ error: 'Butuh header x-ops-token yang sah untuk mengubah data operasional.' });
  }
  next();
}

function tulis(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function sumberKontekstual() {
  const st = scheduler.status();
  const services = health.bangun(st);
  return { st, services };
}

module.exports = function pasang(app, deps) {
  const { clusterHotspots, getHotspots } = deps;

  // ---------- kesehatan ----------
  app.get('/api/operations/health', tulis(async (_req, res) => {
    const { services } = sumberKontekstual();
    res.set('Cache-Control', 'no-store');
    res.json({
      checkedAt: new Date().toISOString(),
      summary: health.ringkas(services),
      application: health.aplikasi(store),
      services
    });
  }));

  app.get('/api/data-sources', tulis(async (_req, res) => {
    const { services } = sumberKontekstual();
    res.set('Cache-Control', 'no-store');
    res.json({
      checkedAt: new Date().toISOString(),
      thresholds: freshness.ambang(),
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
  app.get('/api/alerts', tulis(async (req, res) => {
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

  /** Evaluasi manual — dipakai halaman dan oleh pengujian. */
  app.post('/api/operations/evaluate', penjagaTulis, tulis(async (_req, res) => {
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

  app.post('/api/alerts/:id/incident', penjagaTulis, tulis(async (req, res) => {
    const r = await incidents.fromAlert(req.params.id, req.get('x-ops-actor') || null);
    res.status(r.created ? 201 : 200).json(r);
  }));

  // ---------- insiden ----------
  app.get('/api/incidents', tulis(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ incidents: await incidents.list(req.query) });
  }));

  app.post('/api/incidents', penjagaTulis, tulis(async (req, res) => {
    const inc = await incidents.create(req.body || {}, req.get('x-ops-actor') || null);
    res.status(201).json(inc);
  }));

  app.get('/api/incidents/:id', tulis(async (req, res) => {
    const inc = await incidents.get(req.params.id);
    res.set('Cache-Control', 'no-store');
    res.json(Object.assign({}, inc, { runbooks: runbooks.untukKategori(inc.category) }));
  }));

  app.patch('/api/incidents/:id', penjagaTulis, tulis(async (req, res) => {
    res.json(await incidents.patch(req.params.id, req.body || {}, req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/escalate', penjagaTulis, tulis(async (req, res) => {
    res.json(await incidents.escalate(req.params.id, req.body || {}, req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/resolve', penjagaTulis, tulis(async (req, res) => {
    res.json(await incidents.patch(req.params.id, { status: 'RESOLVED', resolution: (req.body || {}).resolution },
      req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/close', penjagaTulis, tulis(async (req, res) => {
    res.json(await incidents.patch(req.params.id, { status: 'CLOSED' }, req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/notes', penjagaTulis, tulis(async (req, res) => {
    const note = (req.body || {}).note;
    if (!note || !String(note).trim()) return res.status(400).json({ error: 'Catatan tidak boleh kosong.' });
    res.json(await incidents.patch(req.params.id, { note: String(note) },
      req.get('x-ops-actor') || null));
  }));

  app.post('/api/incidents/:id/assign', penjagaTulis, tulis(async (req, res) => {
    const to = (req.body || {}).assignedTo;
    if (!to || !String(to).trim()) return res.status(400).json({ error: 'Nama penanggung jawab wajib diisi.' });
    res.json(await incidents.patch(req.params.id, { assignedTo: String(to) },
      req.get('x-ops-actor') || null));
  }));

  // ---------- runbook ----------
  app.get('/api/runbooks', (_req, res) => {
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
  app.get('/api/operations/metrics', tulis(async (_req, res) => {
    const d = await store.read();
    res.set('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      metrics: incidents.metrik(d.incidents || []),
      counts: { incidents: (d.incidents || []).length, alerts: (d.alerts || []).length },
      storage: store.info()
    });
  }));

  app.get('/api/operations/store', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(store.info());
  });

  // Halaman operasi — satu halaman statis, skrip & gayanya berkas sendiri
  // (CSP 'self' tidak perlu dilonggarkan).
  app.get('/operations', (_req, res) => {
    // Dibaca dari berkas dengan pola yang sama seperti halaman utama:
    // berkas masuk daftar includeFiles Vercel (public/**), jadi tidak hilang
    // di produksi — kelas bug yang memang pernah terjadi di proyek ini.
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'operations.html'), 'utf8');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.send(html);
  });

  app.use((err, req, res, next) => {
    if (!req.path.startsWith('/api/')) return next(err);
    const kode = err.statusCode || 500;
    if (kode >= 500) console.error('[ops]', err.message);
    res.status(kode).json({ error: kode >= 500 ? 'Kesalahan internal pada modul operasional.' : err.message });
  });
};
