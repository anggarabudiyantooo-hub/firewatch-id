'use strict';

const FRAME_HOURS = [0, 6, 12, 18];
const FRAME_INDEXES = FRAME_HOURS;
const STEP_DEGREES = [0.25, 0.5, 1, 1.5];
const CAMS_NATIVE_RESOLUTION_DEG = 0.4;
const CAMS_NATIVE_INTERVAL_HOURS = 3;
const API_UNITS = ['μg/m³', 'µg/m³'];

function normalizeTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value)) return null;
  const timestamp = Date.parse(value + ':00Z');
  if (!Number.isFinite(timestamp)) return null;
  const iso = new Date(timestamp).toISOString();
  return iso.slice(0, 16) === value ? iso : null;
}

function normalizeValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 10) / 10;
}

function frameTimesFor(location) {
  const hourly = location && location.hourly;
  if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.pm2_5)) return null;
  if (hourly.time.length <= 18 || hourly.pm2_5.length <= 18) return null;
  const times = FRAME_INDEXES.map(index => normalizeTime(hourly.time[index]));
  if (times.some(time => !time)) return null;
  const start = Date.parse(times[0]);
  if (times.some((time, index) => Date.parse(time) !== start + FRAME_HOURS[index] * 3600000)) return null;
  return times;
}

function fromOpenMeteo(locations, stepDeg, fetchedAt) {
  const step = Number(stepDeg);
  if (!STEP_DEGREES.includes(step)) return null;
  const list = Array.isArray(locations) ? locations : locations ? [locations] : [];
  if (!list.length) return null;

  const reference = list.find(location => {
    const units = location && location.hourly_units && location.hourly_units.pm2_5;
    return API_UNITS.includes(units) && frameTimesFor(location);
  });
  if (!reference) return null;

  const validTimes = frameTimesFor(reference);
  const pointMap = new Map();
  for (const location of list) {
    const times = frameTimesFor(location);
    if (!times || times.some((time, index) => time !== validTimes[index])) continue;

    const lat = location.latitude;
    const lon = location.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number'
        || !Number.isFinite(lat) || !Number.isFinite(lon)
        || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

    const values = FRAME_INDEXES.map(index => normalizeValue(location.hourly.pm2_5[index]));
    if (values.every(value => value === null)) continue;

    const key = lat.toFixed(3) + ',' + lon.toFixed(3);
    if (!pointMap.has(key)) {
      pointMap.set(key, {
        lat: Number(lat.toFixed(3)),
        lon: Number(lon.toFixed(3)),
        values
      });
    }
  }

  const points = Array.from(pointMap.values());
  const retrievedAt = typeof fetchedAt === 'string' ? Date.parse(fetchedAt) : NaN;
  return {
    available: points.length > 0,
    model: 'CAMS Global',
    source: 'Open-Meteo Air Quality API',
    variable: 'pm2_5',
    units: 'µg/m³',
    surfaceHeightM: 10,
    nativeResolutionDeg: CAMS_NATIVE_RESOLUTION_DEG,
    nativeIntervalHours: CAMS_NATIVE_INTERVAL_HOURS,
    sampleStepDeg: step,
    hours: FRAME_HOURS.slice(),
    validTimes,
    fetchedAt: Number.isFinite(retrievedAt) ? new Date(retrievedAt).toISOString() : null,
    count: points.length,
    points
  };
}

module.exports = {
  FRAME_HOURS,
  CAMS_NATIVE_RESOLUTION_DEG,
  CAMS_NATIVE_INTERVAL_HOURS,
  normalizeTime,
  normalizeValue,
  frameTimesFor,
  fromOpenMeteo
};
