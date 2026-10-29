'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const windGfs = require('../lib/wind-gfs');

const originalFetch = global.fetch;
const originalFetchWindField = windGfs.fetchWindField;
const originalNow = Date.now;
const upstreamRequests = [];
const start = Date.parse('2026-10-19T10:00:00Z');
const hourlyTimes = Array.from({ length: 19 }, (_, index) =>
  new Date(start + index * 3600000).toISOString().slice(0, 16));
let failAirQuality = false;

function fakeGfsField(_fetch, fhour) {
  const ni = 360, nj = 181;
  const u = new Float32Array(ni * nj);
  const v = new Float32Array(ni * nj);
  u.fill(3);
  v.fill(4);
  return Promise.resolve({
    ni, nj, la1: 90, lo1: 0, di: 1, dj: 1, u, v,
    run: '20261019 06Z', fhour
  });
}

function mockLocation(latitude, longitude) {
  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    current: { us_aqi: 28, pm2_5: 4.2, pm10: 8.1 },
    hourly_units: { pm2_5: 'μg/m³' },
    hourly: {
      time: hourlyTimes,
      pm2_5: Array.from({ length: 19 }, (_, hour) => hour + 0.5),
      wind_speed_700hPa: Array.from({ length: 19 }, () => 6),
      wind_direction_700hPa: Array.from({ length: 19 }, () => 270)
    }
  };
}

windGfs.fetchWindField = fakeGfsField;
global.fetch = async function (input) {
  const url = new URL(String(input));
  upstreamRequests.push(url);
  if (url.hostname === 'air-quality-api.open-meteo.com') {
    if (failAirQuality) {
      return { ok: false, status: 429, headers: { get: () => null }, json: async () => ({}) };
    }
    const latitudes = url.searchParams.get('latitude').split(',');
    const longitudes = url.searchParams.get('longitude').split(',');
    const locations = latitudes.map((latitude, index) => mockLocation(latitude, longitudes[index]));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => locations.length === 1 ? locations[0] : locations
    };
  }
  if (url.hostname === 'api.open-meteo.com') {
    const latitudes = url.searchParams.get('latitude').split(',');
    const longitudes = url.searchParams.get('longitude').split(',');
    const locations = latitudes.map((latitude, index) => mockLocation(latitude, longitudes[index]));
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => locations.length === 1 ? locations[0] : locations
    };
  }
  throw new Error('Unexpected upstream host: ' + url.hostname);
};

const app = require('../server');
const server = app.listen(0, '127.0.0.1');
const listening = new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path, headers: { Accept: 'application/json' } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
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
    const base = '/api/smoke-grid?step=0.5&west=110&south=-8&east=112&north=-6';
    const surface = await getJson(port, base + '&level=10m&aqi=1');
    assert.equal(surface.status, 200);
    assert.equal(surface.headers['cache-control'].includes('s-maxage=1800'), true);
    assert.equal(surface.body.pm25Forecast.available, true);
    assert.equal(surface.body.pm25Forecast.count > 0, true);
    assert.equal(surface.body.sourceStatus.pm25.state, 'ready');
    assert.equal(surface.body.windForecast.level, '10m');
    assert.equal(surface.body.windForecast.frames.length, 4);
    assert.equal(surface.body.windForecast.frames[1].hour, 6);
    assert.equal(surface.body.windForecast.frames[1].points.length > 0, true);
    assert.equal(surface.body.windForecast.frames[1].points[0].speed, 5);
    assert.equal(upstreamRequests.filter(url => url.hostname === 'air-quality-api.open-meteo.com').length, 1);
    assert.equal(upstreamRequests[0].searchParams.get('current'), 'pm2_5,pm10,us_aqi');
    assert.equal(upstreamRequests[0].searchParams.get('hourly'), 'pm2_5');
    passed++;
    console.log('  LULUS PM2.5 CAMS dan AQI dibatch sekali; GFS menyediakan empat frame angin 10 m');

    const aloft = await getJson(port, base + '&level=700&aqi=0');
    assert.equal(aloft.status, 200);
    assert.equal(aloft.body.windForecast.level, '700');
    assert.equal(aloft.body.windForecast.frames.length, 4);
    assert.equal(aloft.body.windForecast.frames[0].count > 0, true);
    assert.equal(aloft.body.windForecast.frames[0].points[0].from, 270);
    assert.equal(upstreamRequests.some(url => url.hostname === 'api.open-meteo.com'
      && url.searchParams.get('hourly') === 'wind_speed_700hPa,wind_direction_700hPa'), true);
    passed++;
    console.log('  LULUS level tekanan memakai batch Open-Meteo dan mengikat jam prakiraan');

    const cachedTime = surface.body.pm25Forecast.fetchedAt;
    Date.now = () => originalNow() + 31 * 60 * 1000;
    failAirQuality = true;
    const stale = await getJson(port, base + '&level=10m&aqi=1');
    assert.equal(stale.status, 200);
    assert.equal(stale.body.pm25Forecast.fetchedAt, cachedTime);
    assert.equal(stale.headers['cache-control'].includes('s-maxage=1800'), true);
    passed++;
    console.log('  LULUS stale cache tetap dijawab saat revalidasi latar belakang menemui 429');
  } catch (error) {
    console.error('  GAGAL uji route smoke-grid: ' + error.message);
    process.exitCode = 1;
  } finally {
    Date.now = originalNow;
    failAirQuality = false;
    try { await closeServer(); }
    finally {
      global.fetch = originalFetch;
      windGfs.fetchWindField = originalFetchWindField;
    }
  }

  console.log('\n' + passed + '/3 uji route smoke-grid lulus.');
  if (passed !== 3) process.exitCode = 1;
})();
