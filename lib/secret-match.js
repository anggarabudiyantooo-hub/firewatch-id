'use strict';
/** Compare secrets using fixed-size digests and a timing-safe byte comparison. */
const crypto = require('crypto');

module.exports = function secretMatch(a, b) {
  const x = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const y = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(x, y);
};
