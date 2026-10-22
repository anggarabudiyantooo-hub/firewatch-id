'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const WindViewport = require('../public/wind-viewport');

let passed = 0;
function pass(message) {
  passed++;
  console.log('  LULUS ' + message);
}

function wrapLongitude(lon, center) {
  const offset = ((lon - center + 180) % 360 + 360) % 360 - 180;
  return center + offset;
}

function covered(points, bounds, center) {
  const longitudes = points.map(point => wrapLongitude(point.lon, center));
  const latitudes = points.map(point => point.lat);
  return {
    west: Math.min(...longitudes),
    east: Math.max(...longitudes),
    south: Math.min(...latitudes),
    north: Math.max(...latitudes),
    bounds
  };
}

function getJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1', port, path: pathname,
      headers: { Accept: 'application/json' }
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close(error => error ? reject(error) : resolve());
  });
}

async function main() {
  const lowBounds = { west: 65, south: -35, east: 170, north: 35 };
  const lowRequest = WindViewport.normalizeBounds(lowBounds, 2);
  assert.equal(lowRequest.step, 2);
  assert.equal(lowRequest.west, 64);
  assert.equal(lowRequest.east, 172);
  assert.equal(lowRequest.south, -36);
  assert.equal(lowRequest.north, 36);
  assert.equal(lowRequest.wrapCenter, 118);
  assert.equal(lowRequest.global, false);
  const lowQuery = WindViewport.buildQuery(lowBounds, 2, '10m');
  const lowParams = new URLSearchParams(lowQuery);
  assert.equal(lowParams.get('step'), '2');
  assert.equal(lowParams.get('west'), '64.00');
  assert.equal(lowParams.get('east'), '172.00');
  assert.equal(lowParams.get('south'), '-36.00');
  assert.equal(lowParams.get('north'), '36.00');
  assert.equal(WindViewport.buildQuery(
    { west: 65.2, south: -34.8, east: 170.2, north: 34.8 }, 2, '10m'), lowQuery);
  pass('viewport zoom rendah dikirim dengan bounds yang dikuantisasi untuk cache');

  const crossing = WindViewport.normalizeBounds(
    { west: 165, south: -25, east: 205, north: 25 }, 2);
  assert.equal(crossing.west, -196);
  assert.equal(crossing.east, -152);
  assert.equal(crossing.wrapCenter, -174);
  assert.equal(crossing.global, false);
  const reverseCrossing = WindViewport.normalizeBounds(
    { west: -205, south: -25, east: -165, north: 25 }, 2);
  assert.equal(reverseCrossing.west, 152);
  assert.equal(reverseCrossing.east, 196);
  assert.equal(reverseCrossing.wrapCenter, 174);
  const fullWorld = WindViewport.normalizeBounds(
    { west: -200, south: -85, east: 200, north: 85 }, 1);
  assert.equal(fullWorld.west, -180);
  assert.equal(fullWorld.east, 180);
  assert.equal(fullWorld.step, 3);
  assert.equal(fullWorld.global, true);
  assert.equal(WindViewport.buildQuery(
    { west: 20, south: 10, east: 10, north: 20 }, 2, '10m'), null);
  pass('viewport antimeridian dinormalkan dan bounds tidak valid ditolak');

  const upstreamRequests = [];
  const originalFetch = global.fetch;
  const windGfs = require('../lib/wind-gfs');
  const originalFetchWindField = windGfs.fetchWindField;
  const gridSize = 360 * 181;
  const model = {
    la1: 90, lo1: 0, di: 1, dj: 1, ni: 360, nj: 181,
    u: new Float32Array(gridSize).fill(3),
    v: new Float32Array(gridSize).fill(4),
    run: 'fixture'
  };
  windGfs.fetchWindField = async () => model;

  global.fetch = async function (input) {
    const url = new URL(String(input));
    upstreamRequests.push(url);
    const latitudes = url.searchParams.get('latitude').split(',');
    const longitudes = url.searchParams.get('longitude').split(',');
    assert.equal(latitudes.length, longitudes.length);
    const current = url.searchParams.get('current') || '';
    const match = /wind_speed_(\d+)hPa/.exec(current);
    assert.ok(match, 'request harus meminta aras angin yang valid');
    const hPa = match[1];
    const locations = latitudes.map((latitude, index) => ({
      latitude: Number(latitude),
      longitude: Number(longitudes[index]),
      current: {
        [`wind_speed_${hPa}hPa`]: 5,
        [`wind_direction_${hPa}hPa`]: 270,
        time: '2026-10-22T00:00'
      }
    }));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => locations.length === 1 ? locations[0] : locations
    };
  };

  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  const listening = new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    await listening;
    const port = server.address().port;
    const surface = await getJson(port, '/api/wind-field?' + lowQuery);
    assert.equal(surface.status, 200);
    assert.equal(surface.body.step, 2);
    assert.equal(surface.body.wrapCenter, 118);
    assert.ok(surface.body.count > 0);
    assert.ok(surface.body.points.some(point => point.lon < 84.5));
    assert.ok(surface.body.points.some(point => point.lon > 151.5));
    assert.ok(surface.body.points.some(point => point.lat < -21.5));
    assert.ok(surface.body.points.some(point => point.lat > 16.5));
    pass('grid permukaan mencakup viewport zoom rendah di luar bounds default');

    const worldQuery = WindViewport.buildQuery(
      { west: -200, south: -80, east: 200, north: 80 }, 1, '10m');
    const worldParams = new URLSearchParams(worldQuery);
    assert.equal(worldParams.get('step'), '3');
    assert.equal(worldParams.get('west'), '-180.00');
    assert.equal(worldParams.get('east'), '180.00');
    const worldField = await getJson(port, '/api/wind-field?' + worldQuery);
    assert.equal(worldField.status, 200);
    assert.equal(worldField.body.step, 3);
    assert.equal(worldField.body.wrapCenter, 0);
    assert.equal(worldField.body.global, true);
    assert.ok(worldField.body.count <= 8000);
    pass('viewport selebar dunia memakai grid global yang dibatasi pada resolusi 3 derajat');

    const crossingQuery = WindViewport.buildQuery(
      { west: 165, south: -20, east: 205, north: 20 }, 2, '10m');
    const crossingField = await getJson(port, '/api/wind-field?' + crossingQuery);
    assert.equal(crossingField.status, 200);
    assert.equal(crossingField.body.wrapCenter, -174);
    assert.ok(crossingField.body.points.some(point => point.lon > 160));
    assert.ok(crossingField.body.points.some(point => point.lon < -160));

    const source = fs.readFileSync(path.join(__dirname, '../public/wind-particles.js'), 'utf8');
    const sandbox = { window: { L: {} } };
    vm.runInNewContext(source, sandbox);
    const WindParticles = sandbox.window.WindParticles;
    const particles = new WindParticles({}, {});
    particles.setField(crossingField.body);
    const easternSample = particles._lookup(0, 185);
    const westernSample = particles._lookup(0, -175);
    assert.ok(easternSample && westernSample);
    assert.ok(Math.abs(easternSample[0] - westernSample[0]) < 0.01);
    assert.ok(Math.abs(easternSample[1] - westernSample[1]) < 0.01);
    assert.ok(Math.abs(easternSample[0] - 3) < 0.15);
    assert.ok(Math.abs(easternSample[1] - 4) < 0.15);
    pass('renderer menginterpolasi grid yang melintasi antimeridian secara kontinu');

    const aloftBounds = { west: 62, south: -40, east: 200, north: 35 };
    const aloftQuery = WindViewport.buildQuery(aloftBounds, 2, '850');
    const aloft = await getJson(port, '/api/wind-field?' + aloftQuery);
    assert.equal(aloft.status, 200);
    assert.ok(aloft.body.count > 0);
    assert.ok(aloft.body.count <= 320);
    assert.equal(aloft.body.points.length, aloft.body.count);
    assert.equal(aloft.body.wrapCenter, 130);
    assert.ok(aloft.body.step >= 2);
    assert.equal(upstreamRequests.length, 1);
    const requestLatitudes = upstreamRequests[0].searchParams.get('latitude').split(',');
    const requestLongitudes = upstreamRequests[0].searchParams.get('longitude').split(',');
    assert.ok(requestLatitudes.length <= 320);
    assert.equal(requestLatitudes.length, requestLongitudes.length);
    const extent = covered(aloft.body.points, aloftBounds, aloft.body.wrapCenter);
    assert.ok(extent.south <= aloftBounds.south);
    assert.ok(extent.north >= aloftBounds.north);
    assert.ok(extent.west <= aloftBounds.west);
    assert.ok(extent.east >= aloftBounds.east);
    pass('grid angin atas tetap di bawah 320 titik dan menyebar ke seluruh viewport');

    const aloftCrossingQuery = WindViewport.buildQuery(
      { west: 165, south: -20, east: 205, north: 20 }, 2, '700');
    const aloftCrossing = await getJson(port, '/api/wind-field?' + aloftCrossingQuery);
    assert.equal(aloftCrossing.status, 200);
    assert.equal(aloftCrossing.body.wrapCenter, -174);
    assert.ok(aloftCrossing.body.count <= 320);
    const crossingExtent = covered(
      aloftCrossing.body.points,
      { west: -195, south: -20, east: -155, north: 20 },
      aloftCrossing.body.wrapCenter);
    assert.ok(crossingExtent.west <= -195);
    assert.ok(crossingExtent.east >= -155);
    assert.equal(upstreamRequests.length, 2);
    assert.ok(upstreamRequests[1].searchParams.get('latitude').split(',').length <= 320);
    pass('grid angin atas melintasi antimeridian tanpa mengambil baris pertama saja');

    const partialBounds = await getJson(port,
      '/api/wind-field?step=2&level=10m&west=120');
    assert.equal(partialBounds.status, 400);
    const overWide = await getJson(port,
      '/api/wind-field?step=2&level=10m&west=-180&south=-20&east=181&north=20');
    assert.equal(overWide.status, 400);
    pass('route menolak bounds parsial dan rentang longitude melebihi satu dunia');
  } finally {
    try { await closeServer(server); }
    finally {
      global.fetch = originalFetch;
      windGfs.fetchWindField = originalFetchWindField;
    }
  }

  console.log('\n' + passed + '/8 uji cakupan angin lulus.');
}

main().catch(error => {
  console.error('  GAGAL uji cakupan angin: ' + error.stack);
  process.exitCode = 1;
});
