#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { fetchQuakes, fetchTsunamiBulletins } = require('../lib/hazard');

function httpResponse(body, status) {
  const code = status || 200;
  return {
    ok: code >= 200 && code < 300,
    status: code,
    json: async () => body,
    text: async () => body
  };
}

function quakePayload(time) {
  return { Infogempa: { gempa: [{
    DateTime: time,
    Coordinates: '-5,110',
    Magnitude: '5.0',
    Kedalaman: '10 km',
    Wilayah: 'Laut Jawa'
  }] } };
}

function atomFeed(time) {
  return '<feed><entry><title>Tsunami Warning for Indonesia</title>'
    + '<updated>' + time + '</updated>'
    + '<link href="https://www.tsunami.gov/events/PHEB/1" />'
    + '<summary>Regional bulletin for Indonesia.</summary>'
    + '<geo:lat>-6</geo:lat><geo:long>105</geo:long>'
    + '</entry></feed>';
}

(async () => {
  const emptyQuakes = await fetchQuakes(async () => httpResponse({ Infogempa: { gempa: [] } }));
  assert.deepStrictEqual(emptyQuakes.feedCoverage, { expectedFeeds: 3, availableFeeds: 3, complete: true, failures: [] });
  assert.strictEqual(emptyQuakes.quakes.length, 0);
  console.log('  ✓ Three successful BMKG feeds can report a genuine zero-record window');

  const recentTime = new Date(Date.now() - 60_000).toISOString();
  const partialQuakes = await fetchQuakes(async url => url.endsWith('autogempa.json')
    ? httpResponse(quakePayload(recentTime))
    : httpResponse({}, 503));
  assert.strictEqual(partialQuakes.feedCoverage.expectedFeeds, 3);
  assert.strictEqual(partialQuakes.feedCoverage.availableFeeds, 1);
  assert.strictEqual(partialQuakes.feedCoverage.complete, false);
  assert.strictEqual(partialQuakes.feedCoverage.failures.length, 2);
  assert.strictEqual(partialQuakes.quakes.length, 1);
  console.log('  ✓ Partial BMKG feed failures are preserved beside returned records');

  await assert.rejects(fetchQuakes(async () => httpResponse({}, 503)), /bmkg_all_feeds_unavailable/);
  await assert.rejects(fetchQuakes(async () => httpResponse({ error: 'upstream error' })), /bmkg_all_feeds_unavailable/);
  console.log('  ✓ Total BMKG failure or malformed 200 payload throws instead of becoming an empty success');

  const emptyTsunami = await fetchTsunamiBulletins(async () => httpResponse('<feed></feed>'));
  assert.deepStrictEqual(emptyTsunami.feedCoverage, { expectedFeeds: 2, availableFeeds: 2, complete: true, failures: [] });
  assert.strictEqual(emptyTsunami.bulletins.length, 0);
  console.log('  ✓ Two successful tsunami feeds can return a genuine zero-bulletin window');

  const partialTsunami = await fetchTsunamiBulletins(async url => url.includes('PHEBAtom.xml')
    ? httpResponse(atomFeed(recentTime))
    : httpResponse('', 502));
  assert.strictEqual(partialTsunami.feedCoverage.expectedFeeds, 2);
  assert.strictEqual(partialTsunami.feedCoverage.availableFeeds, 1);
  assert.strictEqual(partialTsunami.feedCoverage.complete, false);
  assert.strictEqual(partialTsunami.feedCoverage.failures.length, 1);
  assert.strictEqual(partialTsunami.bulletins.length, 1);
  console.log('  ✓ Partial tsunami feed failures are visible in source coverage metadata');

  await assert.rejects(fetchTsunamiBulletins(async () => httpResponse('', 503)), /tsunami_all_feeds_unavailable/);
  console.log('  ✓ Total tsunami source failure throws instead of becoming an empty bulletin list');
  console.log('\nHazard feed coverage checks: 6 passed.');
})().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
