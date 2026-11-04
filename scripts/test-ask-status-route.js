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
    const operationsStatusResponse = await fetch(`${origin}/api/status`);
    const operationsStatus = await operationsStatusResponse.json();
    assert.equal(operationsStatusResponse.status, 200);
    assert.equal(operationsStatusResponse.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(operationsStatus).sort(), ['healthy', 'mode', 'tasks', 'total', 'updatedAt']);
    assert.ok(operationsStatus.tasks.length > 0);
    assert.deepEqual(Object.keys(operationsStatus.tasks[0]).sort(), [
      'ageLabel', 'ageMs', 'critical', 'everyLabel', 'everyMs', 'hasData', 'healthy',
      'id', 'label', 'late', 'needsAttention', 'persistentFailure', 'requested'
    ]);
    assert.doesNotMatch(JSON.stringify(operationsStatus), /quota|recentLogs|consecutiveFails|errorNote|endpoint|responseTimeMs|totalRuns/);

    const statusResponse = await fetch(`${origin}/api/ask/status`);
    const status = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
    assert.equal(statusResponse.headers.get('ratelimit-limit'), '240', 'AI status is cheap and stays in the normal bucket');
    assert.deepEqual(Object.keys(status).sort(), ['configuredModel', 'metaApiConfigured', 'verification']);
    assert.equal(typeof status.metaApiConfigured, 'boolean');
    assert.equal(status.verification, 'not_performed');
    assert.equal(status.configuredModel, status.metaApiConfigured ? 'muse-spark-1.3' : null);

    for (const route of [
      '/api/sentinel/meta/extra', '/api/himawari/meta/extra', '/api/aerosol-raster/meta/extra',
      '/api/hazard/extra', '/api/flights/extra', '/api/webcams/foto/extra',
      '/api/volcano-so2/extra', '/api/cron/extra'
    ]) {
      const response = await fetch(origin + route);
      assert.equal(response.status, 404, route + ': unmatched path does not call an upstream');
      assert.equal(response.headers.get('ratelimit-limit'), '90', route + ': hulu path uses the expensive bucket');
      await response.text();
    }

    for (let index = 0; index < 12; index++) {
      const response = index % 2 === 0
        ? await fetch(`${origin}/api/ask?q=`, { headers: { Accept: 'application/json' } })
        : await fetch(`${origin}/api/ask/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: '{}'
        });
      assert.equal(response.status, 400, 'AI request ' + (index + 1) + ' is rejected before any upstream work');
      assert.equal(response.headers.get('ratelimit-limit'), '12');
      await response.text();
    }
    const overLimitAi = await fetch(`${origin}/api/ask/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}'
    });
    assert.equal(overLimitAi.status, 429, 'brief and challenge share the AI provider quota bucket');
    assert.equal(overLimitAi.headers.get('ratelimit-limit'), '12');
    assert.ok(Number(overLimitAi.headers.get('retry-after')) >= 1);
    await overLimitAi.text();

    const robotsResponse = await fetch(`${origin}/robots.txt`);
    const robots = await robotsResponse.text();
    assert.equal(robotsResponse.status, 200);
    for (const privatePrefix of ['/api/', '/operations', '/insiden', '/admin-assets/', '/admin-login']) {
      assert.ok(robots.includes('Disallow: ' + privatePrefix), 'robots excludes ' + privatePrefix);
    }
    const loginPage = await fetch(`${origin}/admin-login`);
    assert.equal(loginPage.status, 200);
    assert.match(loginPage.headers.get('x-robots-tag') || '', /noindex/);
    assert.match(loginPage.headers.get('cache-control') || '', /no-store/);
    const loginAsset = await fetch(`${origin}/admin-login.js`);
    assert.equal(loginAsset.status, 200);
    assert.match(loginAsset.headers.get('x-robots-tag') || '', /noindex/);
    assert.match(loginAsset.headers.get('cache-control') || '', /no-store/);

    for (const route of ['/', '/dashboard', '/reports']) {
      const response = await fetch(origin + route);
      const html = await response.text();
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(html, /assistant-widget\.css\?v=[a-f0-9]{10}/, `${route}: versioned assistant CSS`);
      assert.match(html, /assistant-widget\.js\?v=[a-f0-9]{10}/, `${route}: versioned assistant JS`);
      assert.doesNotMatch(html, /mode lokal · Meta API belum aktif/, `${route}: no misleading initial label`);
    }

    for (const route of ['/operations', '/operations.html', '/insiden/INC-TEST', '/insiden.html']) {
      const response = await fetch(origin + route, { redirect: 'manual' });
      assert.equal(response.status, 303, `${route}: anonymous admin-page redirect`);
      assert.match(response.headers.get('location') || '', /^\/admin-login\?returnTo=/);
      assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
      assert.match(response.headers.get('cache-control') || '', /no-store/);
    }

    for (const asset of ['/assistant-widget.js', '/assistant-widget.css']) {
      const response = await fetch(origin + asset);
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /javascript/);
    }
    console.log('  LULUS API status aman, halaman admin anonim dialihkan, dan aset publik tersedia');
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
