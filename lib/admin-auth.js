'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit').rateLimit;

const COOKIE_NAME = '__Host-siaga_admin';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
const LOGIN_BASE_DELAY_MS = 500;
const LOGIN_MAX_DELAY_MS = 30000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const attemptsByIp = new Map();

function noStore(res) {
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
}

function validPasswordHash(value) {
  const match = /^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/.exec(String(value || ''));
  if (!match) return false;
  const cost = Number(match[1]);
  return cost >= 10 && cost <= 14;
}

function sessionSecret() {
  const secret = String(process.env.SESSION_SECRET || '');
  return Buffer.byteLength(secret, 'utf8') >= 32 ? secret : null;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signSession(payload, secret) {
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const body = encodeJson(payload);
  const input = header + '.' + body;
  const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
  return input + '.' + signature;
}

function createSession(secret, nowSeconds) {
  const now = Number.isInteger(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'admin',
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    csrf: crypto.randomBytes(32).toString('base64url'),
    jti: crypto.randomBytes(16).toString('base64url')
  };
  return { token: signSession(payload, secret), payload };
}

function verifySessionToken(token, secret, nowSeconds) {
  if (typeof token !== 'string' || token.length > 2048 || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  const input = parts[0] + '.' + parts[1];
  let received;
  let header;
  let payload;
  try {
    received = Buffer.from(parts[2], 'base64url');
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  const expected = crypto.createHmac('sha256', secret).update(input).digest();
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') return null;
  const now = Number.isInteger(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  if (!payload || payload.sub !== 'admin' || !Number.isInteger(payload.iat)
      || !Number.isInteger(payload.exp) || payload.iat > now + 60 || payload.exp <= now
      || payload.exp - payload.iat !== SESSION_TTL_SECONDS
      || typeof payload.csrf !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(payload.csrf)
      || typeof payload.jti !== 'string' || !/^[A-Za-z0-9_-]{20,30}$/.test(payload.jti)) return null;
  return payload;
}

function cookieToken(req) {
  const cookie = String(req.get('cookie') || '');
  const prefix = COOKIE_NAME + '=';
  for (const part of cookie.split(';')) {
    const item = part.trim();
    if (item.startsWith(prefix)) return item.slice(prefix.length);
  }
  return '';
}

function currentSession(req) {
  const secret = sessionSecret();
  return secret ? verifySessionToken(cookieToken(req), secret) : null;
}

function cookieValue(token, maxAge) {
  return COOKIE_NAME + '=' + (token || '') + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='
    + String(maxAge);
}

function sameOrigin(req) {
  const origin = String(req.get('origin') || '');
  const host = String(req.get('host') || '');
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    const protocol = process.env.VERCEL || process.env.NODE_ENV === 'production'
      ? 'https:' : (req.protocol === 'https' ? 'https:' : 'http:');
    const expected = new URL(protocol + '//' + host).origin;
    return parsed.origin === expected && !parsed.username && !parsed.password;
  } catch (_) {
    return false;
  }
}

function requestIp(req) {
  return String(req.ip || (req.socket && req.socket.remoteAddress) || 'unknown').slice(0, 100);
}

function pruneAttempts(now) {
  if (attemptsByIp.size <= 5000) return;
  for (const [key, record] of attemptsByIp) {
    if (now - record.windowStartedAt >= LOGIN_WINDOW_MS && record.blockedUntil <= now) {
      attemptsByIp.delete(key);
    }
  }
  if (attemptsByIp.size > 10000) {
    const oldest = [...attemptsByIp.entries()]
      .sort((a, b) => a[1].lastAttemptAt - b[1].lastAttemptAt)
      .slice(0, attemptsByIp.size - 8000);
    oldest.forEach(entry => attemptsByIp.delete(entry[0]));
  }
}

function attemptKey(req) {
  return crypto.createHash('sha256').update(requestIp(req), 'utf8').digest('hex');
}

function loginDelay(key, now) {
  const record = attemptsByIp.get(key);
  if (!record) return 0;
  if (now - record.windowStartedAt >= LOGIN_WINDOW_MS && record.blockedUntil <= now) {
    attemptsByIp.delete(key);
    return 0;
  }
  return Math.max(0, record.blockedUntil - now);
}

function recordLoginFailure(key, now) {
  let record = attemptsByIp.get(key);
  if (!record || now - record.windowStartedAt >= LOGIN_WINDOW_MS) {
    record = { failures: 0, windowStartedAt: now, blockedUntil: 0, lastAttemptAt: now };
  }
  record.failures++;
  record.lastAttemptAt = now;
  const delay = record.failures >= LOGIN_MAX_FAILURES
    ? LOGIN_LOCK_MS
    : Math.min(LOGIN_MAX_DELAY_MS, LOGIN_BASE_DELAY_MS * (2 ** (record.failures - 1)));
  record.blockedUntil = now + delay;
  attemptsByIp.set(key, record);
  pruneAttempts(now);
  return { failures: record.failures, retryAfterSeconds: Math.max(1, Math.ceil(delay / 1000)) };
}

function audit(event, fields) {
  const record = Object.assign({
    at: new Date().toISOString(),
    event: event
  }, fields || {});
  console.info('[admin-audit] ' + JSON.stringify(record));
}

function sendAuthError(res, status, error) {
  noStore(res);
  return res.status(status).json({ error: error || 'Authentication failed.' });
}

const loginRateLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => sendAuthError(res, 429, 'Sign-in temporarily unavailable.')
});

function requireSession(req, res, next) {
  noStore(res);
  const session = currentSession(req);
  if (!session) return sendAuthError(res, 401, 'Authentication required.');
  req.adminSession = session;
  next();
}

function requireAdminRequest(req, res, next) {
  return requireSession(req, res, () => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!sameOrigin(req)) return sendAuthError(res, 403, 'Request rejected.');
    const csrf = String(req.get('x-csrf-token') || '');
    const expected = Buffer.from(req.adminSession.csrf, 'utf8');
    const received = Buffer.from(csrf, 'utf8');
    if (!csrf || received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
      return sendAuthError(res, 403, 'Request rejected.');
    }
    const contentType = String(req.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('application/json')) return sendAuthError(res, 415, 'Unsupported request.');
    next();
  });
}

function requirePageSession(req, res, next) {
  noStore(res);
  const session = currentSession(req);
  if (!session) {
    const returnTo = String(req.originalUrl || req.path || '/operations').slice(0, 500);
    return res.redirect(303, '/admin-login?returnTo=' + encodeURIComponent(returnTo));
  }
  req.adminSession = session;
  next();
}

function auditAction(req, res, next) {
  const startedAt = Date.now();
  res.once('finish', () => {
    audit('operator_action', {
      actor: 'admin',
      method: req.method,
      path: String(req.path || '').slice(0, 180),
      status: res.statusCode,
      durationMs: Math.max(0, Date.now() - startedAt)
    });
  });
  next();
}

function registerRoutes(app) {
  app.post('/api/admin/auth/login', loginRateLimiter, async (req, res) => {
    noStore(res);
    if (!sameOrigin(req)) {
      audit('login_failure', { reason: 'origin_rejected' });
      return sendAuthError(res, 403, 'Sign-in request rejected.');
    }
    const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (Buffer.byteLength(password, 'utf8') > 1024) {
      audit('login_failure', { reason: 'invalid_request' });
      return sendAuthError(res, 400, 'Invalid request.');
    }
    const now = Date.now();
    const key = attemptKey(req);
    const retryMs = loginDelay(key, now);
    if (retryMs > 0) {
      audit('login_failure', { reason: 'rate_limited' });
      res.set('Retry-After', String(Math.max(1, Math.ceil(retryMs / 1000))));
      return sendAuthError(res, 429, 'Sign-in temporarily unavailable.');
    }
    const hash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
    const secret = sessionSecret();
    if (!validPasswordHash(hash) || !secret || !password) {
      audit('login_failure', { reason: 'unavailable' });
      return sendAuthError(res, 503, 'Admin sign-in is unavailable.');
    }
    let matches = false;
    try {
      matches = await bcrypt.compare(password, hash);
    } catch (_) {
      matches = false;
    }
    if (!matches) {
      const failure = recordLoginFailure(key, Date.now());
      audit('login_failure', { reason: 'credentials_rejected', failures: failure.failures });
      res.set('Retry-After', String(failure.retryAfterSeconds));
      return sendAuthError(res, failure.failures >= LOGIN_MAX_FAILURES ? 429 : 401,
        'Invalid credentials.');
    }
    attemptsByIp.delete(key);
    const issued = createSession(secret);
    res.set('Set-Cookie', cookieValue(issued.token, SESSION_TTL_SECONDS));
    audit('login_success', { actor: 'admin' });
    return res.json({
      authenticated: true,
      expiresAt: new Date(issued.payload.exp * 1000).toISOString(),
      csrfToken: issued.payload.csrf
    });
  });

  app.get('/api/admin/auth/session', requireSession, (req, res) => {
    res.json({
      authenticated: true,
      expiresAt: new Date(req.adminSession.exp * 1000).toISOString(),
      csrfToken: req.adminSession.csrf
    });
  });

  app.post('/api/admin/auth/logout', (req, res) => {
    noStore(res);
    const session = currentSession(req);
    if (!sameOrigin(req)) return sendAuthError(res, 403, 'Request rejected.');
    if (session) {
      const csrf = String(req.get('x-csrf-token') || '');
      const expected = Buffer.from(session.csrf, 'utf8');
      const received = Buffer.from(csrf, 'utf8');
      if (!csrf || received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
        return sendAuthError(res, 403, 'Request rejected.');
      }
      audit('logout', { actor: 'admin' });
    }
    res.set('Set-Cookie', cookieValue('', 0));
    return res.status(204).end();
  });
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  registerRoutes,
  requireSession,
  requireAdminRequest,
  requirePageSession,
  auditAction,
  currentSession,
  createSession,
  signSession,
  verifySessionToken,
  sameOrigin,
  validPasswordHash,
  _test: {
    attemptsByIp,
    attemptKey,
    loginDelay,
    recordLoginFailure,
    resetLoginAttempts: () => attemptsByIp.clear()
  }
};
