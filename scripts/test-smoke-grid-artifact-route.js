'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const artifactTools = require('../lib/smoke-grid-artifact');

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-grid-route-'));
const artifactPath = path.join(tempDirectory, 'smoke-grid.json');
const requestedGrid = artifactTools.buildRequestedGrid();
const cellCount = requestedGrid.coordinates.length;
const frameTimes = [0, 6, 12, 18].map(hour =>
  new Date(Date.parse('2026-10-29T00:00:00Z') + hour * 3600000).toISOString());
function framesFor(value) {
  return frameTimes.map((_time, index) => new Array(cellCount).fill(value + index));
}
function coverageFor(frames) {
  return frames.map(frame => {
    const count = frame.filter(Number.isFinite).length;
    return { count, percent: Math.round(count / cellCount * 1000) / 10 };
  });
}
const variables = {};
const values = {
  pm2_5: { label: 'Total PM2.5', units: 'µg/m³', frames: framesFor(5) },
  aerosol_optical_depth: { label: 'Aerosol optical depth', units: '', frames: framesFor(0.1) },
  dust: { label: 'Dust', units: 'µg/m³', frames: framesFor(0) },
  pm10_wildfires: { label: 'PM10 caused by wildfires', units: 'µg/m³', frames: frameTimes.map(() => new Array(cellCount).fill(null)) }
};
Object.entries(values).forEach(([key, entry]) => {
  variables[key] = { ...entry, coverage: coverageFor(entry.frames) };
});
fs.writeFileSync(artifactPath, JSON.stringify({
  schemaVersion: 1,
  source: 'CAMS Global via Open-Meteo Air Quality API',
  model: 'CAMS Global',
  attribution: { dataProvider: 'CAMS / ECMWF', apiProvider: 'Open-Meteo' },
  region: requestedGrid.region,
  grid: requestedGrid.grid,
  hours: [0, 6, 12, 18],
  validTimes: frameTimes,
  nativeResolutionDeg: 0.4,
  nativeIntervalHours: 3,
  surfaceHeightM: 10,
  retrievedAt: new Date().toISOString(),
  dataHash: 'a'.repeat(64),
  cellCount,
  batchCount: Math.ceil(cellCount / 400),
  variables
}));

process.env.SMOKE_GRID_ARTIFACT_PATH = artifactPath;
const originalFetch = global.fetch;
const fetchCalls = [];
global.fetch = async input => {
  fetchCalls.push(String(input));
  throw new Error('Unexpected upstream request from static CAMS route.');
};
const app = require('../server');
const server = app.listen(0, '127.0.0.1');
const listening = new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

function getJson(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: '127.0.0.1', port, path: requestPath, headers: { Accept: 'application/json' }
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(body) });
        } catch (error) { reject(error); }
      });
    });
    request.on('error', reject);
  });
}

function closeServer() {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close(error => error ? reject(error) : resolve());
  });
}

(async () => {
  let passed = 0;
  try {
    await listening;
    const port = server.address().port;
    const regional = await getJson(port,
      '/api/smoke-grid-static?step=1.5&aqi=0&wind=0&west=110.1&south=-7.1&east=111.1&north=-6.1');
    assert.equal(regional.status, 200);
    assert.equal(regional.headers['cache-control'].includes('s-maxage=900'), true);
    assert.ok(regional.body.pm25Forecast.count > 4);
    assert.equal(regional.body.pm25Forecast.sampleStepDeg, 0.4);
    assert.equal(regional.body.pm25Forecast.points[0].values[0], 5);
    assert.equal(regional.body.aerosolForecast.units, '');
    assert.equal(regional.body.dustForecast.units, 'µg/m³');
    assert.equal(regional.body.sourceStatus.pm25.state, 'ready');
    assert.equal(regional.body.sourceStatus.pm10Wildfires.state, 'unavailable');
    assert.equal(fetchCalls.length, 0);
    passed++;
    console.log('  LULUS route menghidangkan grid statis regional, semua variabel terpisah, cache revalidasi dan tanpa fetch CAMS saat runtime');

    const outside = await getJson(port,
      '/api/smoke-grid-static?step=1.5&aqi=0&wind=0&west=150&south=-2&east=151&north=2');
    assert.equal(outside.status, 200);
    assert.equal(outside.body.pm25Forecast.count, 0);
    assert.equal(outside.body.sourceStatus.pm25.state, 'unavailable');
    passed++;
    console.log('  LULUS area di luar cakupan regional dilaporkan tidak tersedia, bukan nilai nol');

    const invalid = await getJson(port,
      '/api/smoke-grid-static?step=1.5&aqi=0&wind=0&west=90&south=-2&east=91');
    assert.equal(invalid.status, 400);
    passed++;
    console.log('  LULUS bounds tidak lengkap ditolak');
  } catch (error) {
    console.error('  GAGAL uji route artefak CAMS: ' + error.message);
    process.exitCode = 1;
  } finally {
    await closeServer();
    global.fetch = originalFetch;
    delete process.env.SMOKE_GRID_ARTIFACT_PATH;
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
  console.log('\n' + passed + '/3 uji route artefak CAMS lulus.');
  if (passed !== 3) process.exitCode = 1;
})();
