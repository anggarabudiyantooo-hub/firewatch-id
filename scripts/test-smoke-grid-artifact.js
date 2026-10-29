'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const artifactTools = require('../lib/smoke-grid-artifact');

const HOURLY_TIMES = Array.from({ length: 19 }, (_, index) =>
  new Date(Date.parse('2026-10-29T00:00:00Z') + index * 3600000).toISOString().slice(0, 16));

function responseLocation(lat, lon, times = HOURLY_TIMES, unit = 'μg/m³') {
  return {
    latitude: Number(lat),
    longitude: Number(lon),
    hourly_units: {
      pm2_5: unit,
      aerosol_optical_depth: '',
      dust: 'μg/m³',
      pm10_wildfires: 'μg/m³'
    },
    hourly: {
      time: times,
      pm2_5: Array.from({ length: 19 }, (_, hour) => 4 + hour + Number(lat) + Number(lon)),
      aerosol_optical_depth: Array.from({ length: 19 }, (_, hour) => 0.1 + hour / 10),
      dust: Array.from({ length: 19 }, () => 0),
      pm10_wildfires: Array.from({ length: 19 }, () => null)
    }
  };
}

function mockFetchFrom(options = {}) {
  const calls = [];
  const startedAt = [];
  let attempts = 0;
  let active = 0;
  let maxConcurrent = 0;
  const fetchImpl = async urlValue => {
    const url = new URL(String(urlValue));
    calls.push(url);
    startedAt.push(Date.now());
    attempts++;
    active++;
    maxConcurrent = Math.max(maxConcurrent, active);
    try {
      if (options.responseDelayMs) {
        await new Promise(resolve => setTimeout(resolve, options.responseDelayMs));
      }
      if (options.rateLimitOnce && attempts === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: name => name.toLowerCase() === 'retry-after' && options.retryAfter !== undefined
            ? String(options.retryAfter) : null },
          json: async () => ({})
        };
      }
      const latitudes = url.searchParams.get('latitude').split(',');
      const longitudes = url.searchParams.get('longitude').split(',');
      let times = HOURLY_TIMES;
      if (options.shiftSecondBatch && calls.length === 2) {
        times = HOURLY_TIMES.map(value => new Date(Date.parse(value + ':00Z') + 3600000)
          .toISOString().slice(0, 16));
      }
      return {
        ok: true,
        status: 200,
        json: async () => latitudes.map((lat, index) =>
          responseLocation(lat, longitudes[index], times, options.badPm25Unit ? 'ppm' : 'μg/m³'))
      };
    } finally {
      active--;
    }
  };
  return {
    fetchImpl, calls, startedAt,
    get attempts() { return attempts; },
    get maxConcurrent() { return maxConcurrent; }
  };
}

async function main() {
  let passed = 0;
  function check(name, fn) {
    try {
      fn();
      passed++;
      console.log('  LULUS ' + name);
    } catch (error) {
      console.error('  GAGAL ' + name + ': ' + error.message);
      throw error;
    }
  }
  async function checkAsync(name, fn) {
    try {
      await fn();
      passed++;
      console.log('  LULUS ' + name);
    } catch (error) {
      console.error('  GAGAL ' + name + ': ' + error.message);
      throw error;
    }
  }

  console.log('\n== artefak grid CAMS regional ==');
  const full = artifactTools.buildRequestedGrid();
  check('grid regional punya buffer satu sel dan memuat batas permintaan 90-145° BT / 15° LS-15° LU', () => {
    assert.ok(full.grid.longitudes[0] <= 90);
    assert.ok(full.grid.longitudes.at(-1) >= 145);
    assert.ok(full.grid.latitudes[0] <= -15);
    assert.ok(full.grid.latitudes.at(-1) >= 15);
    assert.ok(full.grid.nx > 130 && full.grid.ny > 70);
    assert.ok(full.coordinates.length > 10000);
  });
  check('grid regional terbagi ke batch maksimum 400 titik', () => {
    const batches = artifactTools.splitBatches(full.coordinates, 400);
    assert.ok(batches.length >= 27);
    assert.ok(batches.every(batch => batch.length <= 400));
    assert.equal(batches.flat().length, full.coordinates.length);
  });

  let built;
  let calls;
  await checkAsync('builder menyusun empat frame, dimensi, metadata sumber, dan semua variabel tanpa meratakan unit', async () => {
    const mock = mockFetchFrom();
    calls = mock.calls;
    built = await artifactTools.buildRegionalArtifact({
      fetchImpl: mock.fetchImpl,
      bounds: { west: 0, south: 0, east: 0.8, north: 0.8 },
      stepDeg: 0.4,
      paddingDeg: 0,
      batchSize: 4,
      concurrency: 1,
      now: new Date('2026-10-29T01:00:00Z')
    });
    assert.equal(built.grid.nx, 3);
    assert.equal(built.grid.ny, 3);
    assert.equal(built.cellCount, 9);
    assert.equal(built.batchCount, 3);
    assert.deepEqual(built.hours, [0, 6, 12, 18]);
    assert.equal(built.variables.pm2_5.frames[1][0], 10);
    assert.equal(built.variables.aerosol_optical_depth.units, '');
    assert.equal(built.variables.aerosol_optical_depth.frames[0][0], 0.1);
    assert.equal(built.variables.dust.units, 'µg/m³');
    assert.equal(built.variables.pm10_wildfires.coverage[0].count, 0);
    assert.ok(built.dataHash && built.dataHash.length === 64);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].searchParams.get('domains'), 'cams_global');
    assert.equal(calls[0].searchParams.get('cell_selection'), 'nearest');
    assert.equal(calls[0].searchParams.get('hourly'), 'pm2_5,aerosol_optical_depth,dust,pm10_wildfires');
    assert.equal(calls[0].searchParams.get('forecast_hours'), '19');
  });

  await checkAsync('sampling refresh 0,8° tetap menyatakan native 0,4° dan muat dua kali sehari pada kuota gratis', async () => {
    const mock = mockFetchFrom();
    const coarse = await artifactTools.buildRegionalArtifact({
      fetchImpl: mock.fetchImpl,
      bounds: { west: 0, south: 0, east: 0.8, north: 0.8 },
      stepDeg: 0.8,
      paddingDeg: 0.8,
      batchSize: 400,
      concurrency: 1
    });
    const forecast = artifactTools.forecastFromArtifact(coarse, 'pm2_5');
    const regional = artifactTools.buildRequestedGrid(artifactTools.REGION, 0.8, 0.8);
    const refreshScript = fs.readFileSync(path.join(__dirname, 'refresh-smoke-grid.js'), 'utf8');
    assert.equal(coarse.grid.stepDeg, 0.8);
    assert.equal(coarse.nativeResolutionDeg, 0.4);
    assert.equal(forecast.sampleStepDeg, 0.8);
    assert.equal(regional.coordinates.length, 2769);
    assert.ok(regional.coordinates.length * 2 < 10000);
    assert.match(refreshScript, /REFRESH_STEP_DEG = 0\.8/);
    assert.match(refreshScript, /REFRESH_PADDING_DEG = REFRESH_STEP_DEG/);
    assert.match(refreshScript, /stepDeg: REFRESH_STEP_DEG/);
    assert.match(refreshScript, /paddingDeg: REFRESH_PADDING_DEG/);
  });

  check('normalisasi artefak hanya mengembalikan sel dalam viewport dan mempertahankan nilai null', () => {
    assert.equal(artifactTools.validateArtifact(built), true);
    const forecast = artifactTools.forecastFromArtifact(built, 'pm2_5', {
      west: 0.2, south: 0.2, east: 0.8, north: 0.8
    });
    assert.equal(forecast.count, 4);
    assert.deepEqual(forecast.validTimes, built.validTimes);
    const dust = artifactTools.forecastFromArtifact(built, 'dust');
    assert.equal(dust.count, 9);
    assert.equal(dust.available, true);
    assert.equal(dust.points[0].values[0], 0);
  });

  await checkAsync('batch dengan waktu frame berbeda ditolak, bukan dicampur', async () => {
    const mock = mockFetchFrom({ shiftSecondBatch: true });
    await assert.rejects(() => artifactTools.buildRegionalArtifact({
      fetchImpl: mock.fetchImpl,
      bounds: { west: 0, south: 0, east: 0.8, north: 0.8 },
      stepDeg: 0.4,
      paddingDeg: 0,
      batchSize: 4,
      concurrency: 1
    }), /Waktu prakiraan berbeda antarbatch/);
  });

  await checkAsync('429 dicoba ulang dengan batas percobaan sebelum data diterima', async () => {
    const mock = mockFetchFrom({ rateLimitOnce: true });
    const result = await artifactTools.buildRegionalArtifact({
      fetchImpl: mock.fetchImpl,
      bounds: { west: 0, south: 0, east: 0.4, north: 0.4 },
      stepDeg: 0.4,
      paddingDeg: 0,
      batchSize: 4,
      concurrency: 1,
      retryPauseMs: 0
    });
    assert.equal(result.cellCount, 4);
    assert.equal(mock.attempts, 2);
  });

  await checkAsync('pacing minimum berlaku pada setiap request termasuk retry 429 dan memaksa serialisasi', async () => {
    const mock = mockFetchFrom({ rateLimitOnce: true, retryAfter: 0.7, responseDelayMs: 2 });
    const result = await artifactTools.buildRegionalArtifact({
      fetchImpl: mock.fetchImpl,
      bounds: { west: 0, south: 0, east: 0.8, north: 0.8 },
      stepDeg: 0.4,
      paddingDeg: 0,
      batchSize: 4,
      concurrency: 4,
      minimumIntervalMs: 10
    });
    assert.equal(result.batchCount, 3);
    assert.equal(mock.attempts, 4);
    assert.equal(mock.maxConcurrent, 1);
    assert.ok(mock.startedAt[1] - mock.startedAt[0] >= 650, 'Retry-After 0.7 detik harus dihormati');
    assert.ok(mock.startedAt[2] - mock.startedAt[1] >= 8, 'batch berikutnya harus menunggu sesudah retry sukses');
  });

  await checkAsync('429 tanpa header Retry-After memakai jeda cadangan 60 detik', async () => {
    const mock = mockFetchFrom({ rateLimitOnce: true });
    const realSetTimeout = global.setTimeout;
    const delays = [];
    global.setTimeout = (callback, delay, ...args) => {
      delays.push(delay);
      return realSetTimeout(callback, 0, ...args);
    };
    try {
      await artifactTools.buildRegionalArtifact({
        fetchImpl: mock.fetchImpl,
        bounds: { west: 0, south: 0, east: 0.4, north: 0.4 },
        stepDeg: 0.4,
        paddingDeg: 0,
        batchSize: 4,
        concurrency: 1
      });
    } finally {
      global.setTimeout = realSetTimeout;
    }
    assert.ok(delays.includes(60000));
    assert.equal(mock.attempts, 2);
  });

  await checkAsync('unit PM2.5 tidak dikenal menggagalkan build dan melindungi artefak lama', async () => {
    const mock = mockFetchFrom({ badPm25Unit: true });
    await assert.rejects(() => artifactTools.buildRegionalArtifact({
      fetchImpl: mock.fetchImpl,
      bounds: { west: 0, south: 0, east: 0.4, north: 0.4 },
      stepDeg: 0.4,
      paddingDeg: 0,
      batchSize: 4,
      concurrency: 1
    }), /Unit PM2.5/);
  });

  await checkAsync('penulisan atomik tidak memperbarui file bila dataHash sama', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-grid-artifact-'));
    const target = path.join(directory, 'grid.json');
    const first = artifactTools.writeArtifactIfChanged(built, target);
    const second = artifactTools.writeArtifactIfChanged({
      ...built,
      retrievedAt: '2026-10-29T02:00:00.000Z'
    }, target);
    assert.equal(first.changed, true);
    assert.equal(second.changed, false);
    assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).dataHash, built.dataHash);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  check('workflow menangkap artefak pertama yang belum terlacak dan melewati commit bila tidak berubah', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'refresh-smoke-grid.yml'), 'utf8');
    assert.match(workflow, /git status --porcelain -- public\/data\/smoke-grid\.json/);
    assert.match(workflow, /if: steps\.diff\.outputs\.changed == 'true'/);
    assert.match(workflow, /git add public\/data\/smoke-grid\.json/);
  });

  console.log('\n' + passed + '/12 uji artefak CAMS regional lulus.');
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
