'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REGION = Object.freeze({ west: 90, south: -15, east: 145, north: 15 });
const GRID_STEP_DEG = 0.4;
const GRID_PADDING_DEG = GRID_STEP_DEG;
const BATCH_SIZE = 400;
const FRAME_HOURS = Object.freeze([0, 6, 12, 18]);
const FRAME_INDEXES = Object.freeze(FRAME_HOURS.slice());
const SOURCE = 'CAMS Global via Open-Meteo Air Quality API';
const VARIABLES = Object.freeze({
  pm2_5: { label: 'Total PM2.5', units: 'µg/m³', decimals: 1 },
  aerosol_optical_depth: { label: 'Aerosol optical depth', units: '', decimals: 3 },
  dust: { label: 'Dust', units: 'µg/m³', decimals: 1 },
  pm10_wildfires: { label: 'PM10 caused by wildfires', units: 'µg/m³', decimals: 1 }
});
const HOURLY_VARIABLES = Object.keys(VARIABLES);
const ARTIFACT_SCHEMA_VERSION = 1;

function validBounds(bounds) {
  return !!bounds && [bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)
    && bounds.west < bounds.east && bounds.south < bounds.north
    && bounds.west >= -180 && bounds.east <= 180
    && bounds.south >= -90 && bounds.north <= 90;
}

function axisFor(minimum, maximum, step, padding) {
  const start = Math.ceil((minimum - padding) / step - 1e-8);
  const end = Math.floor((maximum + padding) / step + 1e-8);
  const values = [];
  for (let index = start; index <= end; index++) {
    const value = Number((index * step).toFixed(6));
    values.push(Object.is(value, -0) ? 0 : value);
  }
  return values;
}

function buildRequestedGrid(bounds = REGION, step = GRID_STEP_DEG, padding = GRID_PADDING_DEG) {
  if (!validBounds(bounds)) throw new TypeError('Batas grid CAMS tidak valid.');
  if (!Number.isFinite(step) || step < 0.1 || step > 2) {
    throw new TypeError('Langkah grid harus berada pada rentang 0,1-2 derajat.');
  }
  if (!Number.isFinite(padding) || padding < 0 || padding > 2) {
    throw new TypeError('Padding grid harus berada pada rentang 0-2 derajat.');
  }
  const latitudes = axisFor(bounds.south, bounds.north, step, padding);
  const longitudes = axisFor(bounds.west, bounds.east, step, padding);
  if (latitudes.length < 2 || longitudes.length < 2) {
    throw new TypeError('Grid CAMS memerlukan sedikitnya dua baris dan dua kolom.');
  }
  const coordinates = [];
  latitudes.forEach(lat => longitudes.forEach(lon => coordinates.push({ lat, lon })));
  return {
    region: { west: bounds.west, south: bounds.south, east: bounds.east, north: bounds.north },
    grid: {
      west: longitudes[0], south: latitudes[0], east: longitudes[longitudes.length - 1],
      north: latitudes[latitudes.length - 1], stepDeg: step,
      nx: longitudes.length, ny: latitudes.length, latitudes, longitudes,
      paddingDeg: padding
    },
    coordinates
  };
}

function splitBatches(values, batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 400) {
    throw new TypeError('Ukuran batch harus berupa bilangan bulat 1-400.');
  }
  const batches = [];
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }
  return batches;
}

function isoTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + ':00Z');
  if (!Number.isFinite(timestamp)) return null;
  const iso = new Date(timestamp).toISOString();
  return iso.slice(0, 16) === value ? iso : null;
}

function timesFor(location) {
  const hourly = location && location.hourly;
  if (!hourly || !Array.isArray(hourly.time) || hourly.time.length <= 18) return null;
  const frames = FRAME_INDEXES.map(index => isoTime(hourly.time[index]));
  if (frames.some(value => !value)) return null;
  const start = Date.parse(frames[0]);
  if (frames.some((value, index) => Date.parse(value) !== start + FRAME_HOURS[index] * 3600000)) return null;
  return frames;
}

function parseNumber(value, decimals) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const multiplier = 10 ** decimals;
  return Math.round(number * multiplier) / multiplier;
}

function nearestAxisIndex(axis, value, step) {
  const raw = Number(value);
  if (!Number.isFinite(raw) || !Array.isArray(axis) || !axis.length) return -1;
  const index = Math.round((raw - axis[0]) / step);
  if (index < 0 || index >= axis.length || Math.abs(axis[index] - raw) > 0.03) return -1;
  return index;
}

function normalizeResponse(body, chunk, grid, sharedTimes, coverage) {
  const locations = Array.isArray(body) ? body : body ? [body] : [];
  if (locations.length !== chunk.length) {
    throw new Error(`Batch CAMS tidak lengkap: diminta ${chunk.length}, diterima ${locations.length}.`);
  }
  const unique = new Set();
  const rows = [];
  let validTimes = sharedTimes;

  locations.forEach((location, index) => {
    const hourly = location && location.hourly;
    const requested = chunk[index];
    if (!location || !hourly || !Array.isArray(hourly.time)) {
      throw new Error('Respons CAMS tidak memuat data hourly untuk setiap koordinat.');
    }
    const pm25Unit = location.hourly_units && location.hourly_units.pm2_5;
    if (!['μg/m³', 'µg/m³'].includes(pm25Unit)) {
      throw new Error('Unit PM2.5 pada respons CAMS tidak dikenal.');
    }
    const times = timesFor(location);
    if (!times) throw new Error('Respons CAMS tidak menyediakan frame UTC +0/+6/+12/+18 yang lengkap.');
    if (validTimes && times.some((value, frame) => value !== validTimes[frame])) {
      throw new Error('Waktu prakiraan berbeda antarbatch; grid ditolak agar frame tidak tercampur.');
    }
    if (!validTimes) validTimes = times;

    const lat = Number(location.latitude);
    const lon = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)
        || Math.abs(lat - requested.lat) > GRID_STEP_DEG / 2 + 0.05
        || Math.abs(lon - requested.lon) > GRID_STEP_DEG / 2 + 0.05) {
      throw new Error('Koordinat pusat sel CAMS terlalu jauh dari lokasi yang diminta.');
    }
    const y = nearestAxisIndex(grid.latitudes, lat, grid.stepDeg);
    const x = nearestAxisIndex(grid.longitudes, lon, grid.stepDeg);
    if (y < 0 || x < 0) {
      throw new Error('Koordinat pusat sel CAMS tidak sejajar dengan grid sampling regional.');
    }
    const cell = y * grid.nx + x;
    const requestedY = nearestAxisIndex(grid.latitudes, requested.lat, grid.stepDeg);
    const requestedX = nearestAxisIndex(grid.longitudes, requested.lon, grid.stepDeg);
    const requestedCell = requestedY * grid.nx + requestedX;
    if (requestedCell !== cell) {
      throw new Error('Sel CAMS tidak sama dengan koordinat grid yang diminta; cakupan laut/daratan ditolak.');
    }
    if (unique.has(cell)) {
      throw new Error('Batch CAMS menghasilkan sel duplikat; grid regional ditolak.');
    }
    unique.add(cell);

    const values = {};
    HOURLY_VARIABLES.forEach(variable => {
      const variableInfo = VARIABLES[variable];
      const series = hourly[variable];
      const unit = location.hourly_units && location.hourly_units[variable];
      const unitValid = variable === 'aerosol_optical_depth'
        ? ['', '1', 'dimensionless'].includes(unit)
        : ['μg/m³', 'µg/m³'].includes(unit);
      if (!Array.isArray(series) || series.length <= 18 || !unitValid) {
        if (variable === 'pm2_5') throw new Error('Respons CAMS tidak memuat 19 jam PM2.5 dalam µg/m³.');
        values[variable] = FRAME_INDEXES.map(() => null);
        return;
      }
      values[variable] = FRAME_INDEXES.map((frameIndex, frame) => {
        const parsed = parseNumber(series[frameIndex], variableInfo.decimals);
        if (parsed !== null) coverage[variable][frame]++;
        return parsed;
      });
    });

    rows.push({ cell, values });
  });

  return { rows, validTimes };
}

function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let failure = null;
  async function runWorker() {
    while (!failure) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        failure = error;
        return;
      }
    }
  }
  const count = Math.min(Math.max(1, concurrency), items.length);
  return Promise.all(Array.from({ length: count }, () => runWorker())).then(() => {
    if (failure) throw failure;
    return results;
  });
}

async function fetchJsonWithRetry(fetchImpl, url, options, retries, timeoutMs, pause, beforeAttempt) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (typeof beforeAttempt === 'function') await beforeAttempt();
      const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        let reason = '';
        try {
          const body = await response.json();
          reason = body && body.reason ? ` ${body.reason}` : '';
        } catch { /* body galat tidak mengganti status HTTP */ }
        const error = new Error(`Open-Meteo CAMS mengembalikan HTTP ${response.status}.${reason}`);
        error.retryable = retryable;
        const retryAfterHeader = response.headers && response.headers.get
          ? String(response.headers.get('retry-after') || '').trim() : '';
        const retryAfterSeconds = Number(retryAfterHeader);
        const retryAfterDate = Date.parse(retryAfterHeader);
        const retryAfterMs = retryAfterHeader && Number.isFinite(retryAfterSeconds)
          ? Math.max(0, retryAfterSeconds * 1000)
          : retryAfterHeader && Number.isFinite(retryAfterDate)
            ? Math.max(0, retryAfterDate - Date.now()) : null;
        error.retryAfterMs = retryAfterMs !== null ? retryAfterMs
          : response.status === 429 ? 60000 : 0;
        if (!retryable || attempt === retries - 1) throw error;
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
      if ((error && error.retryable === false) || attempt === retries - 1) break;
    }
    const backoff = Math.min(6000, 500 * (2 ** attempt));
    const waitMs = Number.isFinite(pause)
      ? Math.max(0, pause) : Math.max(backoff, lastError && lastError.retryAfterMs || 0);
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }
  throw lastError || new Error('Permintaan grid CAMS gagal.');
}

async function buildRegionalArtifact(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('Fetch API diperlukan untuk mengambil grid CAMS.');
  const bounds = options.bounds || REGION;
  const step = options.stepDeg === undefined ? GRID_STEP_DEG : options.stepDeg;
  const padding = options.paddingDeg === undefined ? GRID_PADDING_DEG : options.paddingDeg;
  const batchSize = options.batchSize === undefined ? BATCH_SIZE : options.batchSize;
  const minimumIntervalMs = options.minimumIntervalMs === undefined ? 0 : options.minimumIntervalMs;
  const requestedConcurrency = options.concurrency === undefined ? 4 : options.concurrency;
  const concurrency = minimumIntervalMs > 0 ? 1 : requestedConcurrency;
  if (!Number.isFinite(minimumIntervalMs) || minimumIntervalMs < 0) {
    throw new TypeError('Interval minimum antarpanggilan tidak valid.');
  }
  const retries = options.retries === undefined ? 3 : options.retries;
  const timeoutMs = options.timeoutMs === undefined ? 30000 : options.timeoutMs;
  const endpoint = options.endpoint || 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const requested = buildRequestedGrid(bounds, step, padding);
  const batches = splitBatches(requested.coordinates, batchSize);
  const coverage = Object.fromEntries(HOURLY_VARIABLES.map(variable => [variable, FRAME_HOURS.map(() => 0)]));
  const frameValues = Object.fromEntries(HOURLY_VARIABLES.map(variable => [
    variable, FRAME_HOURS.map(() => new Array(requested.coordinates.length).fill(null))
  ]));
  const requestIndex = new Map();
  requested.coordinates.forEach((coordinate, index) => {
    const y = Math.round((coordinate.lat - requested.grid.latitudes[0]) / step);
    const x = Math.round((coordinate.lon - requested.grid.longitudes[0]) / step);
    requestIndex.set(y * requested.grid.nx + x, index);
  });
  let sharedTimes = null;
  let lastRequestStartedAt = 0;
  const paceBeforeRequest = async () => {
    if (minimumIntervalMs <= 0) return;
    if (lastRequestStartedAt) {
      const waitMs = Math.max(0, lastRequestStartedAt + minimumIntervalMs - Date.now());
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    lastRequestStartedAt = Date.now();
  };
  const receivedCells = new Set();

  const batchResults = await mapConcurrent(batches, concurrency, async (chunk, batchIndex) => {
    const params = new URLSearchParams({
      latitude: chunk.map(point => point.lat.toFixed(1)).join(','),
      longitude: chunk.map(point => point.lon.toFixed(1)).join(','),
      hourly: HOURLY_VARIABLES.join(','),
      forecast_hours: '19',
      timezone: 'UTC',
      domains: 'cams_global',
      cell_selection: 'nearest'
    });
    const body = await fetchJsonWithRetry(
      fetchImpl, `${endpoint}?${params.toString()}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'Firewatch-ID/1.0 CAMS grid builder' } },
      retries, timeoutMs, options.retryPauseMs, paceBeforeRequest
    );
    const normalized = normalizeResponse(body, chunk, requested.grid, sharedTimes, coverage);
    if (!sharedTimes) sharedTimes = normalized.validTimes;
    normalized.rows.forEach(row => {
      const targetIndex = requestIndex.get(row.cell);
      if (targetIndex === undefined) {
        throw new Error(`Batch ${batchIndex + 1} mengembalikan sel di luar grid regional.`);
      }
      if (receivedCells.has(row.cell)) {
        throw new Error('Sel duplikat lintasbatch terdeteksi; artefak tidak diperbarui.');
      }
      receivedCells.add(row.cell);
      HOURLY_VARIABLES.forEach(variable => {
        row.values[variable].forEach((value, frame) => {
          frameValues[variable][frame][targetIndex] = value;
        });
      });
    });
    return { requested: chunk.length, returned: normalized.rows.length };
  });

  const totalCells = requested.coordinates.length;
  batchResults.forEach(result => {
    if (!result || result.requested !== result.returned) {
      throw new Error('Tidak semua koordinat CAMS berhasil dipetakan ke grid regional.');
    }
  });
  if (receivedCells.size !== totalCells) throw new Error('Grid regional memiliki koordinat yang hilang.');
  if (!sharedTimes || !coverage.pm2_5
      || coverage.pm2_5.some(count => count < totalCells * 0.75)) {
    throw new Error('Cakupan PM2.5 CAMS terlalu rendah; artefak lama dipertahankan.');
  }

  const variables = {};
  HOURLY_VARIABLES.forEach(variable => {
    const info = VARIABLES[variable];
    const frameCoverage = coverage[variable].map(count => ({
      count,
      percent: Math.round((count / totalCells) * 1000) / 10
    }));
    variables[variable] = {
      label: info.label,
      units: info.units,
      frames: frameValues[variable],
      coverage: frameCoverage
    };
  });

  const stablePayload = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    source: SOURCE,
    model: 'CAMS Global',
    attribution: {
      dataProvider: 'Copernicus Atmosphere Monitoring Service (CAMS) / ECMWF',
      apiProvider: 'Open-Meteo',
      sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
      note: 'PM2.5 is total modeled near-surface concentration from all sources, not smoke-specific.'
    },
    region: requested.region,
    grid: requested.grid,
    hours: FRAME_HOURS.slice(),
    validTimes: sharedTimes,
    nativeResolutionDeg: GRID_STEP_DEG,
    nativeIntervalHours: 3,
    surfaceHeightM: 10,
    variables
  };
  const dataHash = crypto.createHash('sha256').update(JSON.stringify(stablePayload)).digest('hex');
  const dateValue = options.now instanceof Date
    ? options.now : typeof options.now === 'function' ? options.now() : new Date();
  const retrievedAt = new Date(dateValue).toISOString();
  return { ...stablePayload, retrievedAt, dataHash, batchCount: batches.length, cellCount: totalCells };
}

function artifactDataHash(artifact) {
  if (!artifact || typeof artifact !== 'object') return null;
  if (typeof artifact.dataHash === 'string' && /^[a-f0-9]{64}$/.test(artifact.dataHash)) return artifact.dataHash;
  const payload = { ...artifact };
  delete payload.retrievedAt;
  delete payload.dataHash;
  delete payload.batchCount;
  delete payload.cellCount;
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function writeArtifactIfChanged(artifact, filePath) {
  if (!artifact || artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION) {
    throw new TypeError('Skema artefak grid CAMS tidak didukung.');
  }
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let previous = null;
  try { previous = JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  if (previous && artifactDataHash(previous) === artifactDataHash(artifact)) {
    return { changed: false, filePath: target, dataHash: artifactDataHash(artifact) };
  }
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(artifact));
  fs.renameSync(temporary, target);
  return { changed: true, filePath: target, dataHash: artifactDataHash(artifact) };
}

function validateArtifact(artifact) {
  if (!artifact || artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION
      || !artifact.grid || !Array.isArray(artifact.grid.latitudes)
      || !Array.isArray(artifact.grid.longitudes) || !artifact.variables
      || !Array.isArray(artifact.validTimes) || artifact.validTimes.length !== FRAME_HOURS.length) return false;
  const cells = artifact.grid.nx * artifact.grid.ny;
  if (!Number.isInteger(cells) || cells < 4 || artifact.grid.latitudes.length !== artifact.grid.ny
      || artifact.grid.longitudes.length !== artifact.grid.nx) return false;
  for (const variable of HOURLY_VARIABLES) {
    const entry = artifact.variables[variable];
    if (!entry || !Array.isArray(entry.frames) || entry.frames.length !== FRAME_HOURS.length
        || entry.frames.some(frame => !Array.isArray(frame) || frame.length !== cells)) return false;
  }
  return true;
}

function forecastFromArtifact(artifact, variable, bounds) {
  if (!validateArtifact(artifact) || !VARIABLES[variable] || !artifact.variables[variable]) return null;
  if (bounds && !validBounds(bounds)) throw new TypeError('Batas permintaan grid CAMS tidak valid.');
  const meta = VARIABLES[variable];
  const entry = artifact.variables[variable];
  const points = [];
  for (let y = 0; y < artifact.grid.ny; y++) {
    const lat = artifact.grid.latitudes[y];
    if (bounds && (lat < bounds.south || lat > bounds.north)) continue;
    for (let x = 0; x < artifact.grid.nx; x++) {
      const lon = artifact.grid.longitudes[x];
      if (bounds && (lon < bounds.west || lon > bounds.east)) continue;
      const cell = y * artifact.grid.nx + x;
      const values = entry.frames.map(frame => frame[cell]);
      if (values.every(value => value === null || !Number.isFinite(value))) continue;
      points.push({ lat, lon, values });
    }
  }
  const coverage = Array.isArray(entry.coverage) ? entry.coverage : [];
  return {
    available: points.length > 0,
    model: artifact.model || 'CAMS Global',
    source: artifact.source || SOURCE,
    variable,
    label: meta.label,
    units: meta.units,
    surfaceHeightM: variable === 'aerosol_optical_depth' ? null : artifact.surfaceHeightM || 10,
    nativeResolutionDeg: artifact.nativeResolutionDeg || GRID_STEP_DEG,
    nativeIntervalHours: artifact.nativeIntervalHours || 3,
    sampleStepDeg: artifact.grid.stepDeg || GRID_STEP_DEG,
    hours: Array.isArray(artifact.hours) ? artifact.hours.slice() : FRAME_HOURS.slice(),
    validTimes: artifact.validTimes.slice(),
    fetchedAt: artifact.retrievedAt || null,
    count: points.length,
    totalCellCount: artifact.cellCount || artifact.grid.nx * artifact.grid.ny,
    coverage,
    points
  };
}

module.exports = {
  REGION,
  GRID_STEP_DEG,
  GRID_PADDING_DEG,
  BATCH_SIZE,
  FRAME_HOURS,
  VARIABLES,
  HOURLY_VARIABLES,
  ARTIFACT_SCHEMA_VERSION,
  buildRequestedGrid,
  splitBatches,
  buildRegionalArtifact,
  artifactDataHash,
  writeArtifactIfChanged,
  validateArtifact,
  forecastFromArtifact
};
