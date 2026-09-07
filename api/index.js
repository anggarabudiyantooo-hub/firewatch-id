'use strict';
/**
 * Titik masuk serverless untuk Vercel.
 *
 * Vercel menjalankan berkas ini sebagai satu function dan meneruskan
 * SEMUA permintaan ke aplikasi Express (lihat rewrite di vercel.json).
 * Berkas statis di `public/` tetap dilayani oleh express.static.
 */
module.exports = require('../server.js');
