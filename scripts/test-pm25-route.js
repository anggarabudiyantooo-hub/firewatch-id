'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');

const upstreamRequests = [];
const originalFetch = global.fetch;
const start = Date.parse('2026-10-19T10:00:00Z');
const hourlyTimes = Array.from({ length: 19 }, (_, index) =>
  new Date(start + index * 3600000).toISOString().slice(0, 16));

// Stub only the upstream fetch. The local Express route is exercised over HTTP.
global.fetch = async function (input) {
  const url = new URL(String(input));
  upstreamRequests.push(url);
  const latitudes = url.searchParams.get('latitude').split(',');
  const longitudes = url.searchParams.get('longitude').split(',');
  const locations = latitudes.map((latitude, index) => {
    const location = {
      latitude: Number(latitude),
      longitude: Number(longitudes[index]),
      hourly_units: { pm2_5: 'μg/m³' },
      hourly: { time: hourlyTimes, pm2_5: Array.from({ length: 19 }, (_, hour) => hour + 0.5) }
    };
    if (url.searchParams.has('current')) {
      location.current = { us_aqi: 28, pm2_5: 4.2, pm10: 8.1 };
    }
    return location;
  });
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

function getJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path, headers: { Accept: 'application/json' } }, res => {
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

function closeServer() {
  return new Promise((resolve, reject) => {
    if (!server.listening) return resolve();
    server.close(error => error ? reject(error) : resolve());
  });
}

(async () => {
  const base = '/api/air-quality?step=0.25&west=110.7&south=-7.75&east=110.95&north=-7.5';
  let passed = 0;

  try {
    await listening;
    const port = server.address().port;
    const pm25Only = await getJson(port, base + '&aqi=0&forecast=1');
    assert.equal(pm25Only.status, 200);
    assert.equal(pm25Only.body.count, 0);
    assert.deepEqual(pm25Only.body.points, []);
    assert.deepEqual(pm25Only.body.legend, []);
    assert.equal(pm25Only.body.pm25Forecast.available, true);
    assert.equal(pm25Only.body.pm25Forecast.count, 1);
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].searchParams.has('current'), false);
    assert.equal(upstreamRequests[0].searchParams.get('hourly'), 'pm2_5');
    assert.equal(upstreamRequests[0].searchParams.get('domains'), 'cams_global');
    assert.equal(upstreamRequests[0].searchParams.get('forecast_hours'), '19');
    assert.equal(upstreamRequests[0].searchParams.get('timezone'), 'UTC');
    passed++;
    console.log('  LULUS PM2.5 saja meminta hourly CAMS tanpa current AQI');

    const aqiOnly = await getJson(port, base + '&aqi=1&forecast=0');
    assert.equal(aqiOnly.status, 200);
    assert.equal(aqiOnly.body.count, 1);
    assert.equal(aqiOnly.body.points.length, 1);
    assert.equal(aqiOnly.body.legend.length, 6);
    assert.equal(aqiOnly.body.pm25Forecast, null);
    assert.equal(upstreamRequests.length, 2);
    assert.equal(upstreamRequests[1].searchParams.get('current'), 'pm2_5,pm10,us_aqi');
    assert.equal(upstreamRequests[1].searchParams.has('hourly'), false);
    passed++;
    console.log('  LULUS US AQI saja meminta current tanpa deret hourly');

    const both = await getJson(port, base + '&aqi=1&forecast=1');
    assert.equal(both.status, 200);
    assert.equal(both.body.count, 1);
    assert.equal(both.body.pm25Forecast.count, 1);
    assert.equal(upstreamRequests.length, 3);
    assert.equal(upstreamRequests[2].searchParams.get('current'), 'pm2_5,pm10,us_aqi');
    assert.equal(upstreamRequests[2].searchParams.get('hourly'), 'pm2_5');
    passed++;
    console.log('  LULUS kedua produk digabung dalam satu request bulk');

    const neither = await getJson(port, base + '&aqi=0&forecast=0');
    assert.equal(neither.status, 200);
    assert.equal(neither.body.count, 0);
    assert.deepEqual(neither.body.points, []);
    assert.deepEqual(neither.body.legend, []);
    assert.equal(neither.body.pm25Forecast, null);
    assert.equal(upstreamRequests.length, 3);
    passed++;
    console.log('  LULUS kedua layer mati tidak memanggil sumber hulu');

    const cached = await getJson(port, base + '&aqi=0&forecast=1');
    assert.equal(cached.body.pm25Forecast.fetchedAt, pm25Only.body.pm25Forecast.fetchedAt);
    assert.equal(upstreamRequests.length, 3);
    passed++;
    console.log('  LULUS cache memisahkan varian dan menjaga hasil PM2.5');
  } catch (error) {
    console.error('  GAGAL uji route PM2.5: ' + error.message);
    process.exitCode = 1;
  } finally {
    try { await closeServer(); }
    finally { global.fetch = originalFetch; }
  }

  console.log('\n' + passed + '/5 uji integrasi route PM2.5 lulus.');
  if (passed !== 5) process.exitCode = 1;
})();
