'use strict';

// Compatibility layer for route handlers in lib/ops-routes.js. Every protected
// Operations route now requires the single ADMIN session; roles and bearer-like
// browser tokens are deliberately no longer accepted.
const adminAuth = require('./admin-auth');

function butuh() {
  return adminAuth.requireAdminRequest;
}

function baca() {
  return adminAuth.requireSession;
}

function info(session) {
  const authenticated = !!(session && session.sub === 'admin');
  return {
    authenticated,
    role: authenticated ? 'ADMIN' : null,
    expiresAt: session && Number.isInteger(session.exp)
      ? new Date(session.exp * 1000).toISOString() : null
  };
}

module.exports = { butuh, baca, info };
