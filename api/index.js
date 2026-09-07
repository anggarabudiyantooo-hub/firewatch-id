'use strict';
/**
 * Titik masuk serverless untuk Vercel.
 *
 * Aplikasi Express dimuat di dalam try/catch supaya kegagalan saat memuat modul
 * (berkas tidak ikut ter-bundle, dependensi hilang, dsb.) tidak berubah menjadi
 * FUNCTION_INVOCATION_FAILED yang tanpa keterangan. Detail galat HANYA
 * ditampilkan bila permintaan menyertakan kunci diagnostik yang benar.
 */
let app = null;
let loadError = null;

try {
  app = require('../server.js');
} catch (err) {
  loadError = err;
  console.error('[boot] gagal memuat server.js:', err && err.stack);
}

// Kunci diagnostik: set DEBUG_KEY di Environment Variables untuk melihat detail.
const DEBUG_KEY = (process.env.DEBUG_KEY || '').trim();

module.exports = (req, res) => {
  if (app) return app(req, res);

  const url = new URL(req.url || '/', 'http://localhost');
  const key = url.searchParams.get('debug') || '';

  res.statusCode = 500;

  if (DEBUG_KEY && key === DEBUG_KEY) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(
      'GAGAL MEMUAT APLIKASI\n\n'
      + 'message: ' + (loadError && loadError.message) + '\n'
      + 'code: ' + (loadError && loadError.code) + '\n\n'
      + 'stack:\n' + (loadError && loadError.stack) + '\n\n'
      + 'cwd: ' + process.cwd() + '\n'
      + 'dirname: ' + __dirname + '\n'
      + 'node: ' + process.version + '\n'
    );
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Terjadi kesalahan pada server.' }));
};
