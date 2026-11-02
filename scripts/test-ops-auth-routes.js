'use strict';
/**
 * Uji integrasi HTTP untuk fail-closed RBAC Operations Center.
 * Semua penyimpanan diarahkan ke berkas sementara lokal; tidak ada permintaan
 * ke produksi, GitHub, Upstash, atau sumber data hulu.
 */

const assert = require('assert');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const kunciEnv = [
  'OPS_TOKEN_VIEWER', 'OPS_TOKEN_OPERATOR', 'OPS_TOKEN_ADMIN', 'OPS_WRITE_TOKEN',
  'OPS_READ_PROTECTED', 'OPS_STORE_FILE', 'OPS_GITHUB_TOKEN', 'OPS_GITHUB_REPO',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'CRON_SECRET', 'VERCEL',
  'VERCEL_ENV', 'VERCEL_GIT_COMMIT_SHA', 'OPS_WARMUP_MS', 'NODE_ENV'
];
const envSebelum = {};
kunciEnv.forEach(k => { envSebelum[k] = process.env[k]; delete process.env[k]; });

const berkasUji = path.join(os.tmpdir(), 'siaga-ops-auth-routes-' + process.pid + '.json');
process.env.OPS_STORE_FILE = berkasUji;
// Pengaturan lama ini sengaja tidak boleh menonaktifkan pengamanan pembacaan.
process.env.OPS_READ_PROTECTED = '0';

const app = express();
app.use(express.json());
const pasangOps = require('../lib/ops-routes');
const autentikasiCron = require('../lib/cron-auth');
const secretMatch = require('../lib/secret-match');
const store = require('../lib/ops-store');
pasangOps(app, {
  clusterHotspots: () => [],
  getHotspots: async () => ({ hotspots: [] })
});

let lulus = 0;
function cek(nama, dapat, harap) {
  assert.deepStrictEqual(dapat, harap, nama);
  lulus++;
  console.log('  LULUS  ' + nama);
}

function ujiMiddlewareCron(authorization, query) {
  const r = { status: 200, body: null };
  let diteruskan = false;
  const req = {
    query: query || {},
    get: (nama) => nama.toLowerCase() === 'authorization' ? authorization : undefined
  };
  const res = {
    set: () => res,
    status: (kode) => { r.status = kode; return res; },
    json: (body) => { r.body = body; return res; }
  };
  autentikasiCron(req, res, () => { diteruskan = true; });
  return { status: r.status, body: r.body, diteruskan };
}

async function panggil(base, pathname, opsi) {
  const o = opsi || {};
  const headers = { Accept: 'application/json' };
  if (o.token) headers['x-ops-token'] = o.token;
  if (o.actor) headers['x-ops-actor'] = o.actor;
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + pathname, {
    method: o.method || 'GET',
    headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body)
  });
  return { status: r.status, body: await r.json() };
}

(async () => {
  cek('secret match menerima nilai sama dan menolak beda/panjang beda',
    [secretMatch('sama', 'sama'), secretMatch('sama', 'beda'), secretMatch('x', 'lebih panjang')],
    [true, false, false]);

  process.env.VERCEL = '1';
  delete process.env.CRON_SECRET;
  let cron = ujiMiddlewareCron('');
  cek('cron production tanpa CRON_SECRET fail-closed',
    [cron.status, cron.diteruskan], [503, false]);
  process.env.CRON_SECRET = 'cron-test-secret';
  cron = ujiMiddlewareCron('Bearer salah');
  cek('cron menolak bearer yang salah', [cron.status, cron.diteruskan], [401, false]);
  cron = ujiMiddlewareCron('', { key: 'cron-test-secret' });
  cek('secret di query string tidak lagi mengautentikasi cron', [cron.status, cron.diteruskan], [401, false]);
  cron = ujiMiddlewareCron('Bearer cron-test-secret');
  cek('cron menerima bearer sah', [cron.status, cron.diteruskan], [200, true]);
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL;
  cron = ujiMiddlewareCron('');
  cek('cron lokal tetap bisa dijalankan tanpa secret', [cron.status, cron.diteruskan], [200, true]);
  const kodeServer = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  cek('route /api/cron dipasang dengan middleware autentikasi',
    /app\.get\('\/api\/cron',\s*autentikasiCron,\s*async/.test(kodeServer), true);
  const mulaiDiag = kodeServer.indexOf("app.get('/api/sentinel/diag'");
  const akhirDiag = kodeServer.indexOf("app.get('/api/casualties'", mulaiDiag);
  const kodeDiag = kodeServer.slice(mulaiDiag, akhirDiag);
  cek('diagnostik Sentinel memakai Bearer, bukan secret query',
    [kodeDiag.includes("req.get('authorization')"), kodeDiag.includes('req.query.key')], [true, false]);

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const base = 'http://127.0.0.1:' + server.address().port;

    cek('uji terisolasi memakai penyimpanan file lokal', store.mode, 'file');
    let r = await panggil(base, '/api/operations/access');
    cek('status akses publik menunjukkan terkunci tanpa token',
      [r.status, r.body.mode, r.body.readProtected, r.body.peranAnda], [200, 'terkunci', true, null]);
    cek('status akses tidak mengklaim ada peran terkonfigurasi', r.body.peranDikonfigurasi,
      { VIEWER: false, OPERATOR: false, ADMIN: false });

    for (const [nama, pathname, opsi] of [
      ['health operations', '/api/operations/health', {}],
      ['store operations', '/api/operations/store', {}],
      ['daftar insiden', '/api/incidents', {}],
      ['detail insiden', '/api/incidents/INC-2026-00001', {}],
      ['daftar runbook', '/api/runbooks', {}],
      ['detail runbook', '/api/runbooks/RB-001', {}],
      ['buat insiden', '/api/incidents', { method: 'POST', body: { title: 'uji', severity: 'LOW', category: 'lain_lain' } }],
      ['evaluasi alert', '/api/operations/evaluate', { method: 'POST' }],
      ['alert ke insiden', '/api/alerts/ALR-20261102-00001/incident', { method: 'POST' }]
    ]) {
      r = await panggil(base, pathname, opsi);
      cek('tanpa token: ' + nama + ' fail-closed 503',
        [r.status, r.body.mode, r.body.konfigurasiDiperlukan], [503, 'terkunci', true]);
    }
    cek('permintaan tanpa token tidak menulis keadaan', (await store.read()).incidents.length, 0);

    // Endpoint ini adalah pengecualian yang disengaja untuk monitor ketersediaan
    // publik: ia hanya mengembalikan ringkasan kesehatan, bukan data operasional.
    r = await panggil(base, '/api/alarm');
    cek('endpoint alarm ringkas tetap dapat dipakai monitor publik', r.status, 200);

    process.env.OPS_TOKEN_VIEWER = 'viewer-test-secret';
    process.env.OPS_TOKEN_OPERATOR = 'operator-test-secret';
    process.env.OPS_TOKEN_ADMIN = 'admin-test-secret';

    r = await panggil(base, '/api/operations/health');
    cek('tanpa header setelah token dipasang: 401', [r.status, r.body.mode], [401, 'token']);
    r = await panggil(base, '/api/operations/health', { token: 'bukan-token' });
    cek('token tidak sah: 401', r.status, 401);
    r = await panggil(base, '/api/operations/health', { token: 'viewer-test-secret' });
    cek('VIEWER boleh membaca health', r.status, 200);

    r = await panggil(base, '/api/incidents/INC-2026-00001');
    cek('detail insiden tetap meminta auth setelah token dipasang', r.status, 401);
    r = await panggil(base, '/api/runbooks/RB-001');
    cek('detail runbook tetap meminta auth setelah token dipasang', r.status, 401);
    r = await panggil(base, '/api/runbooks/RB-001', { token: 'viewer-test-secret' });
    cek('VIEWER dapat membaca detail runbook', [r.status, r.body.id], [200, 'RB-001']);

    r = await panggil(base, '/api/incidents', {
      method: 'POST', token: 'viewer-test-secret',
      body: { title: 'uji route auth', severity: 'LOW', category: 'lain_lain' }
    });
    cek('VIEWER tidak dapat membuat insiden', r.status, 403);
    cek('penolakan role VIEWER tidak menulis data', (await store.read()).incidents.length, 0);

    r = await panggil(base, '/api/operations/evaluate', { method: 'POST', token: 'operator-test-secret' });
    cek('OPERATOR tidak dapat memicu evaluasi ADMIN', r.status, 403);
    r = await panggil(base, '/api/incidents', {
      method: 'POST', token: 'operator-test-secret', actor: 'uji',
      body: { title: 'uji route auth', severity: 'LOW', category: 'lain_lain' }
    });
    cek('OPERATOR dapat membuat insiden setelah autentikasi', r.status, 201);
    const id = r.body.incidentId;

    r = await panggil(base, '/api/incidents/' + encodeURIComponent(id), { token: 'viewer-test-secret' });
    cek('VIEWER dapat membaca detail insiden yang terlindungi', [r.status, r.body.incidentId], [200, id]);
    r = await panggil(base, '/api/incidents', { token: 'viewer-test-secret' });
    cek('pengaturan OPS_READ_PROTECTED=0 tidak membuka daftar insiden', r.status, 200);
    cek('token tidak ikut dipantulkan dalam status akses',
      JSON.stringify((await panggil(base, '/api/operations/access')).body).includes('viewer-test-secret'), false);
  } finally {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    try { fs.unlinkSync(berkasUji); } catch (_) { /* berkas bisa belum dibuat */ }
    kunciEnv.forEach(k => {
      if (envSebelum[k] === undefined) delete process.env[k];
      else process.env[k] = envSebelum[k];
    });
  }
  console.log('\n' + lulus + ' uji route Operations lulus.');
})().catch(e => {
  console.error('  GAGAL  uji route Operations:', e.stack || e.message);
  process.exitCode = 1;
});
