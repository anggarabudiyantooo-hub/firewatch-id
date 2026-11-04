'use strict';

// Kontrak rute /api/map-narrative: validasi masukan, kelas rate limit,
// dan parser bodi besar. Semua kasus di sini ditolak sebelum pekerjaan
// hulu dijalankan, jadi uji ini tidak memanggil pihak ketiga.

const assert = require('node:assert/strict');
const app = require('../server');

const GOOD_IMAGE = 'data:image/png;base64,' + 'A'.repeat(60000);

function post(origin, body) {
  return fetch(origin + '/api/map-narrative', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  });
}

async function main() {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;

    const invalid = await post(origin, { image: GOOD_IMAGE, meta: { bounds: { west: 10, east: 5, south: 0, north: 1 } } });
    assert.equal(invalid.status, 400, 'kotak pandang terbalik ditolak');
    assert.equal(invalid.headers.get('ratelimit-limit'), '6', 'narasi bergambar punya kelas kuota sendiri');
    const invalidBody = await invalid.json();
    assert.equal(invalidBody.ok, false);
    assert.equal(invalidBody.error, 'BOUNDS_INVALID');

    const missing = await post(origin, { image: GOOD_IMAGE, meta: {} });
    assert.equal(missing.status, 400, 'tanpa batas peta tidak ada narasi');
    await missing.text();

    const outOfRange = await post(origin, { image: GOOD_IMAGE, meta: { bounds: { west: -400, south: -200, east: 400, north: 200 } } });
    assert.equal(outOfRange.status, 400, 'koordinat di luar rentang ditolak, bukan dijepit diam-diam');
    await outOfRange.text();

    // Bodi 60kb membuktikan parser 4mb dipasang sebelum parser global 32kb:
    // kalau urutannya salah, balasan akan 413, bukan 400.
    assert.ok(GOOD_IMAGE.length > 32 * 1024, 'bodi uji memang lebih besar dari batas global');

    for (let index = 0; index < 3; index++) {
      const response = await post(origin, { meta: {} });
      assert.equal(response.status, 400);
      await response.text();
    }
    const overLimit = await post(origin, { meta: {} });
    assert.equal(overLimit.status, 429, 'kuota narasi bergambar lebih ketat daripada tanya-jawab teks');
    assert.equal(overLimit.headers.get('ratelimit-limit'), '6');
    assert.ok(Number(overLimit.headers.get('retry-after')) >= 1);
    await overLimit.text();

    // Kelas teks tidak ikut habis karena kelas gambar penuh.
    const textAsk = await fetch(origin + '/api/ask?q=', { headers: { Accept: 'application/json' } });
    assert.equal(textAsk.status, 400);
    assert.equal(textAsk.headers.get('ratelimit-limit'), '12', 'kuota tanya-jawab teks terpisah');
    await textAsk.text();

    const status = await (await fetch(origin + '/api/ask/status')).json();
    assert.doesNotMatch(JSON.stringify(status), /sk-|Bearer |MODEL_API_KEY\s*=/, 'status tidak membocorkan kunci');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('  LULUS kontrak rute narasi peta (validasi, kuota, bodi besar)');
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('  GAGAL', error && error.message);
  process.exit(1);
});
