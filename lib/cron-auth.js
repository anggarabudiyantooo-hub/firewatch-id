'use strict';
/**
 * Authentikasi untuk endpoint penjadwal yang dapat memanggil sumber hulu dan
 * menulis hasil evaluasi alert. Di deployment production, tanpa CRON_SECRET
 * endpoint fail-closed; development lokal tetap dapat menjalankannya.
 */

const secretMatch = require('./secret-match');

module.exports = function autentikasiCron(req, res, next) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (!secret) {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({
        error: 'CRON_SECRET belum dikonfigurasi; penyegaran terjadwal dikunci.'
      });
    }
    return next();
  }

  const authz = String(req.get('authorization') || '');
  const cocok = /^Bearer (.+)$/.exec(authz);
  const kiriman = cocok ? cocok[1] : '';
  if (!kiriman || !secretMatch(kiriman, secret)) {
    res.set('Cache-Control', 'no-store');
    return res.status(401).json({ error: 'Tidak diizinkan.' });
  }
  return next();
};
