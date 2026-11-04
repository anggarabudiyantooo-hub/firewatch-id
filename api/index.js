'use strict';
/**
 * Titik masuk serverless untuk Vercel.
 *
 * Bila aplikasi Express gagal dimuat, klien hanya menerima galat generik.
 * Rincian boot tidak pernah diberikan lewat query string atau HTTP response.
 */
let app = null;

try {
  app = require('../server.js');
} catch (_err) {
  // Catat hanya kejadian generik; stack, path, konfigurasi, dan nilai env tetap privat.
  console.error('[boot] gagal memuat server.js');
}

module.exports = (req, res) => {
  if (app) return app(req, res);

  res.statusCode = 500;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Terjadi kesalahan pada server.' }));
};
