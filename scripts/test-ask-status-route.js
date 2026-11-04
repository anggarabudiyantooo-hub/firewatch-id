'use strict';

const assert = require('node:assert/strict');
const app = require('../server');

async function main() {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const statusResponse = await fetch(`${origin}/api/ask/status`);
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(status).sort(), ['configuredModel', 'metaApiConfigured', 'verification']);
    assert.equal(typeof status.metaApiConfigured, 'boolean');
    assert.equal(status.verification, 'not_performed');
    assert.equal(status.configuredModel, status.metaApiConfigured ? 'muse-spark-1.3' : null);

    for (const route of ['/', '/dashboard', '/reports', '/operations', '/insiden/INC-TEST']) {
      const response = await fetch(origin + route);
      const html = await response.text();
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(html, /assistant-widget\.css\?v=[a-f0-9]{10}/, `${route}: versioned assistant CSS`);
      assert.match(html, /assistant-widget\.js\?v=[a-f0-9]{10}/, `${route}: versioned assistant JS`);
      assert.doesNotMatch(html, /mode lokal · Meta API belum aktif/, `${route}: no misleading initial label`);
    }

    for (const asset of ['/assistant-widget.js', '/assistant-widget.css']) {
      const response = await fetch(origin + asset);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /javascript/);
    }
    console.log('  LULUS API status aman, semua halaman memakai widget versi terbaru, dan aset tersedia');
  } finally {
    const closed = new Promise(resolve => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await closed;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
