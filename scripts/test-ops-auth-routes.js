'use strict';
/** HTTP integration tests for admin-session guards on Operations handlers. */

const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const adminAuth = require('../lib/admin-auth');

const envKeys = [
  'OPS_TOKEN_VIEWER', 'OPS_TOKEN_OPERATOR', 'OPS_TOKEN_ADMIN', 'OPS_WRITE_TOKEN', 'OPS_READ_PROTECTED',
  'OPS_STORE_FILE', 'OPS_GITHUB_TOKEN', 'OPS_GITHUB_REPO', 'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN', 'CRON_SECRET', 'VERCEL', 'VERCEL_ENV', 'VERCEL_GIT_COMMIT_SHA',
  'OPS_WARMUP_MS', 'ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'NODE_ENV'
];
const envBefore = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const storeFile = path.join(os.tmpdir(), 'siaga-admin-auth-' + process.pid + '.json');
let passed = 0;
const originalInfo = console.info;
const auditLines = [];

function check(name, actual, expected) {
  assert.deepStrictEqual(actual, expected, name);
  passed++;
  console.log('  PASS ' + name);
}

async function request(base, pathname, options) {
  const opts = options || {};
  const headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;
  if (opts.origin) headers.Origin = opts.origin;
  if (opts.body !== undefined) headers['Content-Type'] = opts.contentType || 'application/json';
  const response = await fetch(base + pathname, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: opts.redirect || 'follow'
  });
  const text = response.status === 204 ? '' : await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { response, body };
}

async function run() {
  envKeys.forEach(key => { delete process.env[key]; });
  process.env.NODE_ENV = 'test';
  process.env.OPS_STORE_FILE = storeFile;
  process.env.OPS_READ_PROTECTED = '0';

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  adminAuth.registerRoutes(app);
  app.use('/api/admin', adminAuth.requireAdminRequest, adminAuth.auditAction);
  require('../lib/ops-routes')(app, {
    clusterHotspots: () => [],
    getHotspots: async () => ({ hotspots: [] }),
    getAssetVersion: () => '0123456789'
  });
  app.get('/admin-login', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html')));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  const cronAuth = require('../lib/cron-auth');
  const secretMatch = require('../lib/secret-match');
  const store = require('../lib/ops-store');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const origin = base;
  console.info = (...args) => auditLines.push(args.join(' '));

  try {
    check('secret matcher accepts equal and rejects different inputs',
      [secretMatch('same', 'same'), secretMatch('same', 'different'), secretMatch('x', 'longer')],
      [true, false, false]);

    process.env.VERCEL = '1';
    delete process.env.CRON_SECRET;
    let cronResult = await new Promise(resolve => {
      const req = { get: () => '', query: {} };
      const res = {
        statusCode: 200, body: null,
        set: () => res,
        status(code) { res.statusCode = code; return res; },
        json(body) { res.body = body; resolve({ status: res.statusCode, body: res.body, next: false }); }
      };
      cronAuth(req, res, () => resolve({ status: res.statusCode, next: true }));
    });
    check('production cron without secret fails closed', cronResult.status, 503);
    process.env.CRON_SECRET = 'cron-test-secret';
    cronResult = await new Promise(resolve => {
      const req = { get: name => name.toLowerCase() === 'authorization' ? 'Bearer wrong' : '', query: {} };
      const res = {
        statusCode: 200,
        set: () => res,
        status(code) { res.statusCode = code; return res; },
        json(body) { resolve({ status: res.statusCode, body }); }
      };
      cronAuth(req, res, () => resolve({ status: res.statusCode, next: true }));
    });
    check('cron rejects an invalid bearer token', cronResult.status, 401);
    cronResult = await new Promise(resolve => {
      const req = { get: () => '', query: { secret: 'cron-test-secret' } };
      const res = {
        statusCode: 200,
        set: () => res,
        status(code) { res.statusCode = code; return res; },
        json(body) { resolve({ status: res.statusCode, body }); }
      };
      cronAuth(req, res, () => resolve({ status: res.statusCode, next: true }));
    });
    check('cron does not accept a secret in query string', cronResult.status, 401);
    cronResult = await new Promise(resolve => {
      const req = { get: name => name.toLowerCase() === 'authorization' ? 'Bearer cron-test-secret' : '', query: {} };
      const res = { set: () => res };
      cronAuth(req, res, () => resolve({ status: 200, next: true }));
    });
    check('cron accepts the configured Bearer secret', cronResult.status, 200);
    delete process.env.CRON_SECRET;
    delete process.env.VERCEL;

    check('isolated operations tests use temporary file storage', store.mode, 'file');
    let result = await request(base, '/api/admin/operations/health');
    check('operations health rejects a request without a session', result.response.status, 401);
    result = await request(base, '/api/operations/access');
    check('legacy access endpoint no longer exists', result.response.status, 404);
    result = await request(base, '/api/admin/incidents', {
      method: 'POST', origin, body: { title: 'test', severity: 'LOW', category: 'lain_lain' }
    });
    check('incident mutation rejects a request without a session', result.response.status, 401);
    check('unauthenticated requests do not write incident state', (await store.read()).incidents.length, 0);

    for (const pagePath of [
      '/operations', '/operations/', '/operations.html', '/operations/not-a-page',
      '/insiden/INC-2026-00001', '/insiden/not-a-page/extra', '/insiden.html'
    ]) {
      result = await request(base, pagePath, { redirect: 'manual' });
      check('page admin anonim diarahkan ke login: ' + pagePath,
        [result.response.status, (result.response.headers.get('location') || '').startsWith('/admin-login?returnTo=')],
        [303, true]);
    }
    result = await request(base, '/admin-assets/ops.js');
    check('asset admin anonim mendapat 401', result.response.status, 401);
    result = await request(base, '/ops.js');
    check('URL lama ops.js tidak lagi disajikan dari public', result.response.status, 404);
    result = await request(base, '/admin-login.html');
    check('halaman login publik tetap tersedia dan noindex',
      [result.response.status, /noindex/.test(String(result.body))], [200, true]);

    result = await request(base, '/api/alarm');
    check('minimal public alarm remains available', result.response.status, 200);

    const password = require('node:crypto').randomBytes(32).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 10);
    process.env.ADMIN_PASSWORD_HASH = passwordHash;
    process.env.SESSION_SECRET = require('node:crypto').randomBytes(48).toString('base64url');
    result = await request(base, '/api/admin/auth/login', {
      method: 'POST', origin, body: { password }
    });
    check('admin password establishes the session', [result.response.status, result.body.authenticated], [200, true]);
    const cookieHeader = result.response.headers.get('set-cookie');
    const cookie = (cookieHeader || '').split(';')[0];
    const csrf = result.body.csrfToken;
    check('session cookie is secure and HttpOnly',
      /HttpOnly/.test(cookieHeader) && /Secure/.test(cookieHeader) && /SameSite=Strict/.test(cookieHeader), true);
    result = await request(base, '/operations', { cookie });
    check('halaman Operations hanya diberikan setelah sesi sah',
      [result.response.status, String(result.body).includes('/admin-assets/ops.js'), /no-store/.test(result.response.headers.get('cache-control'))],
      [200, true, true]);
    check('asset assistant tetap terversi pada halaman admin privat',
      [String(result.body).includes('/assistant-widget.css?v=0123456789'),
        String(result.body).includes('/assistant-widget.js?v=0123456789')], [true, true]);
    result = await request(base, '/operations.html', { cookie });
    check('alias operations.html juga terjaga oleh sesi', result.response.status, 200);
    result = await request(base, '/insiden/INC-2026-00001', { cookie });
    check('lembar insiden juga terjaga oleh sesi', result.response.status, 200);
    result = await request(base, '/operations/not-a-page', { cookie });
    check('path turunan Operations tetap terkunci dan berakhir 404 setelah login', result.response.status, 404);
    result = await request(base, '/insiden/not-a-page/extra', { cookie });
    check('path turunan insiden tetap terkunci dan berakhir 404 setelah login', result.response.status, 404);
    result = await request(base, '/admin-assets/ops-core.js', { cookie });
    check('asset inti dilayani privat tanpa cache',
      [result.response.status, /no-store/.test(result.response.headers.get('cache-control')),
        /noindex/.test(result.response.headers.get('x-robots-tag')),
        /x-ops-token/i.test(String(result.body))], [200, true, true, false]);

    result = await request(base, '/api/admin/operations/health');
    check('session cookie required on reads', result.response.status, 401);
    result = await request(base, '/api/admin/operations/health', { cookie });
    check('admin session can read operational health', result.response.status, 200);
    result = await request(base, '/api/admin/auth/session', { cookie });
    check('auth session returns authentication state and CSRF, not env names',
      [result.response.status, result.body.authenticated, !!result.body.csrfToken, 'namaDiperiksa' in result.body],
      [200, true, true, false]);

    const protectedReads = [
      '/api/admin/data-sources', '/api/admin/alerts', '/api/admin/incidents?sort=activity',
      '/api/admin/runbooks', '/api/admin/runbooks/RB-001', '/api/admin/operations/metrics',
      '/api/admin/operations/audit?limit=25', '/api/admin/operations/analytics?hari=14',
      '/api/admin/operations/infra'
    ];
    for (const pathName of protectedReads) {
      result = await request(base, pathName);
      check('endpoint admin anonim ditolak: ' + pathName, result.response.status, 401);
      result = await request(base, pathName, { cookie });
      check('endpoint admin sah dapat dibaca: ' + pathName, result.response.status, 200);
    }

    result = await request(base, '/api/admin/incidents', {
      method: 'POST', cookie, origin,
      body: { title: 'CSRF test', severity: 'LOW', category: 'lain_lain' }
    });
    check('admin cookie alone is insufficient for a mutation', result.response.status, 403);
    check('CSRF rejection leaves incident state unchanged', (await store.read()).incidents.length, 0);
    result = await request(base, '/api/admin/incidents', {
      method: 'POST', cookie, origin: 'https://attacker.example', csrf,
      body: { title: 'origin test', severity: 'LOW', category: 'lain_lain' }
    });
    check('cross-site Origin is rejected despite a valid session and CSRF token', result.response.status, 403);
    result = await request(base, '/api/admin/incidents', {
      method: 'POST', cookie, origin, csrf, contentType: 'application/x-www-form-urlencoded',
      body: { title: 'wrong content type', severity: 'LOW', category: 'lain_lain' }
    });
    check('mutations reject non-JSON content types', result.response.status, 415);
    check('rejected content types do not write incident state', (await store.read()).incidents.length, 0);
    result = await request(base, '/api/admin/incidents', {
      method: 'POST', cookie, origin, csrf,
      headers: { 'x-ops-actor': 'spoofed-operator' },
      body: { title: 'authorized test incident', severity: 'LOW', category: 'lain_lain' }
    });
    check('valid admin session + same-origin CSRF token may create an incident', result.response.status, 201);
    const incidentId = result.body.incidentId;
    const storedIncident = (await store.read()).incidents.find(item => item.incidentId === incidentId);
    check('server records the authenticated admin, not a spoofed actor header',
      storedIncident.timeline[0].by, 'admin');
    result = await request(base, '/api/admin/incidents/' + encodeURIComponent(incidentId), { cookie });
    check('admin session may read an incident detail', [result.response.status, result.body.incidentId], [200, incidentId]);

    result = await request(base, '/api/admin/operations/evaluate', {
      method: 'POST', cookie, origin, csrf, body: {}
    });
    check('manual evaluation is protected by the admin session and CSRF check', result.response.status, 200);
    result = await request(base, '/api/admin/operations/store?uji=1', { cookie });
    check('diagnostic storage read still requires an admin session', result.response.status, 200);

    result = await request(base, '/api/admin/sensitive-test');
    check('central /api/admin namespace guard blocks unauthenticated reads', result.response.status, 401);
    result = await request(base, '/api/admin/sensitive-test', { cookie });
    check('central /api/admin namespace does not reveal details for unknown paths', result.response.status, 404);

    process.env.OPS_TOKEN_ADMIN = 'old-token-must-not-authenticate';
    result = await request(base, '/api/admin/operations/health', {
      headers: { 'x-ops-token': 'old-token-must-not-authenticate' }
    });
    check('legacy x-ops-token is not accepted instead of a session cookie', result.response.status, 401);
    const auditText = auditLines.join('\\n');
    const sessionToken = cookie.slice(cookie.indexOf('=') + 1);
    check('audit log records sign-in and authenticated operator actions',
      /login_success/.test(auditText) && /operator_action/.test(auditText), true);
    check('audit log omits password, password hash, session cookie, and CSRF token',
      [password, passwordHash, sessionToken, csrf].every(value => !auditText.includes(value)), true);
    check('audit log path omits query-string diagnostics',
      [auditText.includes('/api/admin/operations/store'), auditText.includes('uji=1')], [true, false]);
  } finally {
    console.info = originalInfo;
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    try { fs.unlinkSync(storeFile); } catch (_) { /* store can be absent */ }
    envKeys.forEach(key => {
      if (envBefore[key] === undefined) delete process.env[key];
      else process.env[key] = envBefore[key];
    });
  }
  console.log('\n' + passed + ' Operations session route checks passed.');
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
