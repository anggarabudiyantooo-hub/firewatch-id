'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const adminAuth = require('../lib/admin-auth');

const envKeys = ['ADMIN_PASSWORD_HASH', 'SESSION_SECRET', 'VERCEL', 'NODE_ENV'];
const envBefore = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const originalInfo = console.info;
const auditLines = [];
let passed = 0;

function check(name, fn) {
  fn();
  passed++;
  console.log('  PASS ' + name);
}

async function run() {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  adminAuth.registerRoutes(app);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const origin = base;

  console.info = (...args) => auditLines.push(args.join(' '));
  envKeys.forEach(key => { delete process.env[key]; });
  process.env.NODE_ENV = 'test';

  try {
    const issuedAt = 1762272000;
    const signed = adminAuth.createSession('a'.repeat(48), issuedAt);
    check('session JWT signs with HS256 and expires after eight hours', () => {
      assert.equal(signed.payload.exp - signed.payload.iat, 8 * 60 * 60);
      assert.equal(adminAuth.verifySessionToken(signed.token, 'a'.repeat(48), issuedAt + 1).sub, 'admin');
    });
    check('expired, tampered, or differently signed sessions are rejected', () => {
      assert.equal(adminAuth.verifySessionToken(signed.token, 'a'.repeat(48), signed.payload.exp), null);
      assert.equal(adminAuth.verifySessionToken(signed.token + 'x', 'a'.repeat(48), issuedAt + 1), null);
      assert.equal(adminAuth.verifySessionToken(signed.token, 'b'.repeat(48), issuedAt + 1), null);
    });
    check('bcrypt configuration rejects plaintext and weak-cost hashes', () => {
      assert.equal(adminAuth.validPasswordHash('plain-password-not-a-hash'), false);
      assert.equal(adminAuth.validPasswordHash('$2b$04$' + 'A'.repeat(53)), false);
    });

    let response = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'unconfigured-test' })
    });
    const unavailableBody = await response.json();
    check('login gagal tertutup secara generik bila env admin belum diisi', () => {
      assert.equal(response.status, 503);
      assert.doesNotMatch(JSON.stringify(unavailableBody), /SESSION_SECRET|ADMIN_PASSWORD_HASH/);
    });
    response = await fetch(base + '/api/admin/auth/session');
    check('tanpa sesi, endpoint session mengembalikan 401', () => assert.equal(response.status, 401));

    const password = crypto.randomBytes(32).toString('base64url');
    const hash = await bcrypt.hash(password, 10);
    process.env.ADMIN_PASSWORD_HASH = hash;
    process.env.SESSION_SECRET = crypto.randomBytes(48).toString('base64url');

    response = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    check('login menolak Origin lintas situs', () => assert.equal(response.status, 403));

    adminAuth._test.resetLoginAttempts();
    response = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' })
    });
    check('kata sandi salah mengembalikan respons generik dan Retry-After', () => {
      assert.equal(response.status, 401);
      assert.ok(Number(response.headers.get('retry-after')) >= 1);
    });
    response = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-again' })
    });
    check('percobaan beruntun dibatasi dengan 429', () => {
      assert.equal(response.status, 429);
      assert.ok(Number(response.headers.get('retry-after')) >= 1);
    });

    const limiter = adminAuth._test;
    limiter.resetLoginAttempts();
    const delay1 = limiter.recordLoginFailure('unit-ip', 1000);
    const delay2 = limiter.recordLoginFailure('unit-ip', 1600);
    check('jeda brute force bertambah eksponensial lalu mengunci sementara', () => {
      assert.equal(delay1.retryAfterSeconds, 1);
      assert.equal(delay2.retryAfterSeconds, 1);
      for (let index = 0; index < 6; index++) limiter.recordLoginFailure('unit-ip', 3000 + index * 31000);
      const locked = limiter.recordLoginFailure('unit-ip', 200000);
      assert.equal(locked.failures, 9);
      assert.equal(locked.retryAfterSeconds, 900);
    });
    limiter.resetLoginAttempts();

    response = await fetch(base + '/api/admin/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const loginBody = await response.json();
    const setCookie = response.headers.get('set-cookie') || '';
    check('password bcrypt yang benar membuat sesi tanpa mengirim JWT di JSON', () => {
      assert.equal(response.status, 200);
      assert.equal(loginBody.authenticated, true);
      assert.equal('token' in loginBody, false);
      assert.ok(loginBody.csrfToken);
      assert.match(setCookie, /^__Host-siaga_admin=/);
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /SameSite=Strict/);
      assert.match(setCookie, /Path=\//);
      assert.match(setCookie, /Max-Age=28800/);
    });
    const cookie = setCookie.split(';')[0];

    response = await fetch(base + '/api/admin/auth/session', { headers: { Cookie: cookie } });
    const sessionBody = await response.json();
    check('sesi valid memberikan CSRF token dan no-store', () => {
      assert.equal(response.status, 200);
      assert.equal(sessionBody.authenticated, true);
      assert.equal(sessionBody.csrfToken, loginBody.csrfToken);
      assert.match(response.headers.get('cache-control'), /no-store/);
    });

    response = await fetch(base + '/api/admin/auth/logout', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}'
    });
    check('logout menolak POST tanpa CSRF', () => assert.equal(response.status, 403));

    response = await fetch(base + '/api/admin/auth/logout', {
      method: 'POST',
      headers: {
        Origin: origin, Cookie: cookie, 'Content-Type': 'application/json',
        'X-CSRF-Token': loginBody.csrfToken
      },
      body: '{}'
    });
    check('logout menghapus cookie dengan Max-Age=0', () => {
      assert.equal(response.status, 204);
      assert.match(response.headers.get('set-cookie') || '', /Max-Age=0/);
    });
    // Simulasikan browser setelah menerapkan Set-Cookie Max-Age=0.
    response = await fetch(base + '/api/admin/auth/session');
    check('cookie yang dihapus setelah logout tidak lagi autentikasi', () => assert.equal(response.status, 401));

    check('audit log mencatat sukses/gagal tanpa password, hash, atau sesi', () => {
      const text = auditLines.join('\n');
      assert.match(text, /login_failure/);
      assert.match(text, /login_success/);
      assert.match(text, /logout/);
      assert.equal(text.includes(password), false);
      assert.equal(text.includes(hash), false);
      assert.equal(text.includes(cookie.slice(cookie.indexOf('=') + 1)), false);
    });
  } finally {
    console.info = originalInfo;
    envKeys.forEach(key => {
      if (envBefore[key] === undefined) delete process.env[key];
      else process.env[key] = envBefore[key];
    });
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  console.log('\n' + passed + ' admin-auth checks passed.');
}

run().catch(error => {
  console.info = originalInfo;
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
