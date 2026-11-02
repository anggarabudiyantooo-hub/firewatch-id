'use strict';

const crypto = require('node:crypto');

const FIRMS_SOURCE_URL = 'https://firms.modaps.eosdis.nasa.gov/active_fire/';
const MAX_HOTSPOTS_PER_CAPTURE = 15000;
const DEFAULT_SOURCE_MAX_AGE_MS = 20 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function boundedText(value, limit = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isoFromMs(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceSkip(reason, sourceState, nowMs) {
  const age = sourceState && finiteNumber(sourceState.lastOkAgeMs)
    ? Math.max(0, Math.round(sourceState.lastOkAgeMs)) : null;
  return {
    eligible: false,
    status: 'skipped',
    reason,
    rollups: [],
    run: {
      source_key: 'nasa_firms_hotspots',
      status: 'skipped',
      capture_day_wib: null,
      started_at: isoFromMs(nowMs),
      completed_at: isoFromMs(nowMs),
      source_captured_at: sourceState ? isoFromMs(parseTimestamp(sourceState.lastSuccessfulAt)) : null,
      source_age_ms: age,
      source_healthy: !!(sourceState && sourceState.healthy),
      source_mode: null,
      source_window_hours: null,
      oldest_event_at: null,
      newest_event_at: null,
      input_count: 0,
      valid_count: 0,
      duplicate_count: 0,
      rejected_count: 0,
      rollup_count: 0,
      coverage_status: 'source_coverage_unknown',
      content_hash: null,
      details: { reason }
    }
  };
}

function addDetection(aggregate, hotspot, eventMs) {
  aggregate.hotspot_count++;
  if (hotspot.confidence >= 80) aggregate.high_confidence_count++;
  aggregate.frp_sum += hotspot.frp;
  aggregate.confidence_sum += hotspot.confidence;
  if (hotspot.satellite) aggregate.satellites.add(boundedText(hotspot.satellite, 48) || 'unknown');
  aggregate.oldest_event_ms = aggregate.oldest_event_ms === null
    ? eventMs : Math.min(aggregate.oldest_event_ms, eventMs);
  aggregate.newest_event_ms = aggregate.newest_event_ms === null
    ? eventMs : Math.max(aggregate.newest_event_ms, eventMs);
}

function newAggregate(regionKey, regionLevel, regionName, assignmentMethod) {
  return {
    region_key: regionKey,
    region_level: regionLevel,
    region_name: regionName,
    region_assignment_method: assignmentMethod,
    hotspot_count: 0,
    high_confidence_count: 0,
    frp_sum: 0,
    confidence_sum: 0,
    satellites: new Set(),
    unassigned_count: 0,
    oldest_event_ms: null,
    newest_event_ms: null
  };
}

function finishAggregate(aggregate, captureDay, windowHours, qualityStatus) {
  const totalFrp = Number(aggregate.frp_sum.toFixed(3));
  const meanConfidence = aggregate.hotspot_count
    ? Number((aggregate.confidence_sum / aggregate.hotspot_count).toFixed(2)) : null;
  const row = {
    region_key: aggregate.region_key,
    region_level: aggregate.region_level,
    region_name: aggregate.region_name,
    region_assignment_method: aggregate.region_assignment_method,
    hotspot_count: aggregate.hotspot_count,
    high_confidence_count: aggregate.high_confidence_count,
    frp_total_mw: totalFrp,
    mean_confidence: meanConfidence,
    satellite_count: aggregate.satellites.size,
    unassigned_count: aggregate.unassigned_count,
    oldest_event_at: isoFromMs(aggregate.oldest_event_ms),
    newest_event_at: isoFromMs(aggregate.newest_event_ms),
    quality_status: qualityStatus
  };
  row.content_hash = sha256(JSON.stringify({
    capture_day_wib: captureDay,
    source_window_hours: windowHours,
    ...row
  }));
  return row;
}

function buildFireCapture(snapshot, sourceState, options = {}) {
  const nowMs = finiteNumber(options.nowMs) ? options.nowMs : Date.now();
  const intervalMs = sourceState && finiteNumber(sourceState.everyMs) && sourceState.everyMs > 0
    ? sourceState.everyMs : null;
  const maxAgeMs = finiteNumber(options.maxSourceAgeMs) && options.maxSourceAgeMs > 0
    ? options.maxSourceAgeMs
    : Math.max(intervalMs ? intervalMs * 2 : DEFAULT_SOURCE_MAX_AGE_MS, DEFAULT_SOURCE_MAX_AGE_MS);
  const sourceAgeMs = sourceState && finiteNumber(sourceState.lastOkAgeMs)
    ? Math.max(0, Math.round(sourceState.lastOkAgeMs)) : null;
  const sourceCapturedAtMs = sourceState ? parseTimestamp(sourceState.lastSuccessfulAt) : null;
  const captureAtMs = sourceCapturedAtMs === null ? nowMs : sourceCapturedAtMs;

  if (!sourceState || !sourceState.hasData || !sourceState.healthy) {
    return sourceSkip('SOURCE_UNAVAILABLE', sourceState, nowMs);
  }
  if (sourceAgeMs === null || sourceCapturedAtMs === null) {
    return sourceSkip('SOURCE_FRESHNESS_UNKNOWN', sourceState, nowMs);
  }
  if (sourceAgeMs > maxAgeMs) {
    return sourceSkip('SOURCE_STALE', sourceState, nowMs);
  }
  if (!snapshot || snapshot.mode !== 'live') {
    return sourceSkip('SOURCE_NOT_LIVE', sourceState, nowMs);
  }
  if (!Array.isArray(snapshot.hotspots)) {
    return sourceSkip('MISSING_HOTSPOT_ARRAY', sourceState, nowMs);
  }
  const windowHours = snapshot.windowHours;
  if (!finiteNumber(windowHours) || windowHours < 1 || windowHours > 168) {
    return sourceSkip('SOURCE_WINDOW_UNKNOWN', sourceState, nowMs);
  }

  const captureDay = localDayWib(captureAtMs);
  if (!captureDay) return sourceSkip('CAPTURE_DAY_UNKNOWN', sourceState, nowMs);
  const sourceRows = snapshot.hotspots.slice(0, MAX_HOTSPOTS_PER_CAPTURE);
  const truncated = snapshot.hotspots.length > sourceRows.length;
  const seen = new Set();
  const aggregates = new Map();
  const provinceOf = typeof options.provinceOf === 'function' ? options.provinceOf : () => null;
  const maxEventAgeMs = windowHours * 60 * 60 * 1000 + sourceAgeMs + 5 * 60 * 1000;
  let rejectedCount = 0;
  let duplicateCount = 0;
  let validCount = 0;
  let oldestEventMs = null;
  let newestEventMs = null;

  function ensureAggregate(key, level, name, method) {
    if (!aggregates.has(key)) aggregates.set(key, newAggregate(key, level, name, method));
    return aggregates.get(key);
  }

  for (const hotspot of sourceRows) {
    if (!hotspot || !finiteNumber(hotspot.lat) || !finiteNumber(hotspot.lon)
        || hotspot.lat < -90 || hotspot.lat > 90
        || hotspot.lon < -180 || hotspot.lon > 180
        || !finiteNumber(hotspot.frp) || hotspot.frp < 0
        || !finiteNumber(hotspot.confidence) || hotspot.confidence < 0 || hotspot.confidence > 100) {
      rejectedCount++;
      continue;
    }
    const eventMs = parseTimestamp(hotspot.acq);
    if (eventMs === null || eventMs > captureAtMs + 5 * 60 * 1000
        || captureAtMs - eventMs > maxEventAgeMs) {
      rejectedCount++;
      continue;
    }

    const eventKey = [hotspot.lat.toFixed(4), hotspot.lon.toFixed(4), new Date(eventMs).toISOString()].join('|');
    if (seen.has(eventKey)) {
      duplicateCount++;
      continue;
    }
    seen.add(eventKey);
    validCount++;
    oldestEventMs = oldestEventMs === null ? eventMs : Math.min(oldestEventMs, eventMs);
    newestEventMs = newestEventMs === null ? eventMs : Math.max(newestEventMs, eventMs);

    let provinceName = null;
    try { provinceName = boundedText(provinceOf(hotspot.lat, hotspot.lon), 100) || null; } catch (_) { provinceName = null; }
    const country = ensureAggregate('ID', 'country', 'Indonesia', 'country_total');
    addDetection(country, hotspot, eventMs);
    if (provinceName) {
      const provinceKey = 'ID:' + provinceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const province = ensureAggregate(provinceKey, 'province', provinceName, 'coarse_rectangular_province_boxes');
      addDetection(province, hotspot, eventMs);
    } else {
      country.unassigned_count++;
      const unassigned = ensureAggregate('unassigned', 'unassigned', null, 'unassigned');
      addDetection(unassigned, hotspot, eventMs);
    }
  }

  if (truncated) rejectedCount += snapshot.hotspots.length - sourceRows.length;
  if (snapshot.hotspots.length > 0 && validCount === 0) {
    return sourceSkip('NO_VALID_OBSERVATIONS', sourceState, nowMs);
  }

  const partial = rejectedCount > 0 || duplicateCount > 0 || truncated;
  const status = validCount === 0 ? 'empty' : partial ? 'partial' : 'complete';
  const qualityStatus = partial ? 'partial' : 'observed';
  const rollups = Array.from(aggregates.values())
    .map(aggregate => finishAggregate(aggregate, captureDay, Math.round(windowHours), qualityStatus))
    .sort((a, b) => a.region_key.localeCompare(b.region_key));
  const sourceLabel = boundedText(snapshot.source, 160);
  const contentHash = sha256(JSON.stringify({
    capture_day_wib: captureDay,
    source_window_hours: Math.round(windowHours),
    status,
    input_count: snapshot.hotspots.length,
    valid_count: validCount,
    duplicate_count: duplicateCount,
    rejected_count: rejectedCount,
    rollup_hashes: rollups.map(row => row.content_hash)
  }));

  return {
    eligible: true,
    status,
    reason: null,
    rollups,
    run: {
      source_key: 'nasa_firms_hotspots',
      status,
      capture_day_wib: captureDay,
      started_at: isoFromMs(nowMs),
      completed_at: isoFromMs(nowMs),
      source_captured_at: isoFromMs(captureAtMs),
      source_age_ms: sourceAgeMs,
      source_healthy: true,
      source_mode: snapshot.mode,
      source_window_hours: Math.round(windowHours),
      oldest_event_at: isoFromMs(oldestEventMs),
      newest_event_at: isoFromMs(newestEventMs),
      input_count: snapshot.hotspots.length,
      valid_count: validCount,
      duplicate_count: duplicateCount,
      rejected_count: rejectedCount,
      rollup_count: rollups.length,
      coverage_status: rollups.length ? 'rolling_window_snapshot' : 'empty_feed_not_zero',
      content_hash: contentHash,
      details: {
        source_label: sourceLabel,
        source_url: FIRMS_SOURCE_URL,
        region_assignment: 'coarse rectangular province boxes; approximate only',
        stored_shape: 'daily regional aggregates only; no raw hotspot rows or coordinates',
        truncated,
        maximum_rows_examined_per_capture: MAX_HOTSPOTS_PER_CAPTURE
      }
    }
  };
}

function parseDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T12:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function localDayWib(value) {
  const ms = typeof value === 'number' ? value : parseTimestamp(value);
  if (ms === null) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(ms));
  const picked = Object.create(null);
  for (const part of parts) if (part.type !== 'literal') picked[part.type] = part.value;
  if (!picked.year || !picked.month || !picked.day) return null;
  return `${picked.year}-${picked.month}-${picked.day}`;
}

function calendarFeatures(dayWib) {
  const date = parseDay(dayWib);
  if (!date) return null;
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - start) / DAY_MS) + 1;
  const angle = (2 * Math.PI * (dayOfYear - 1)) / 365.2425;
  return {
    calendar_month: date.getUTCMonth() + 1,
    day_of_year: dayOfYear,
    day_of_week: date.getUTCDay() || 7,
    annual_sin: Number(Math.sin(angle).toFixed(6)),
    annual_cos: Number(Math.cos(angle).toFixed(6))
  };
}

function dailyFireFeatures(detections) {
  const grouped = new Map();
  for (const row of Array.isArray(detections) ? detections : []) {
    if (!row || !finiteNumber(row.frp_mw ?? row.frpMw)
        || !finiteNumber(row.confidence)
        || row.confidence < 0 || row.confidence > 100) continue;
    const day = localDayWib(row.acquired_at || row.acquiredAt);
    if (!day) continue;
    const region = boundedText(row.province_name ?? row.provinceName, 100) || null;
    const key = `${region || '__unassigned__'}\u0000${day}`;
    let feature = grouped.get(key);
    if (!feature) {
      feature = {
        provinceName: region,
        dayWib: day,
        hotspotCount: 0,
        highConfidenceCount: 0,
        totalFrpMw: 0,
        confidenceTotal: 0,
        sourceSatelliteSet: new Set()
      };
      grouped.set(key, feature);
    }
    feature.hotspotCount++;
    if (row.confidence >= 80) feature.highConfidenceCount++;
    feature.totalFrpMw += row.frp_mw ?? row.frpMw;
    feature.confidenceTotal += row.confidence;
    const satellite = boundedText(row.satellite, 48);
    if (satellite) feature.sourceSatelliteSet.add(satellite);
  }
  return Array.from(grouped.values()).map(feature => {
    const calendar = calendarFeatures(feature.dayWib);
    return {
      provinceName: feature.provinceName,
      dayWib: feature.dayWib,
      hotspotCount: feature.hotspotCount,
      highConfidenceCount: feature.highConfidenceCount,
      totalFrpMw: Number(feature.totalFrpMw.toFixed(3)),
      meanConfidence: Number((feature.confidenceTotal / feature.hotspotCount).toFixed(2)),
      satelliteCount: feature.sourceSatelliteSet.size,
      calendar
    };
  }).sort((a, b) => a.dayWib.localeCompare(b.dayWib)
    || String(a.provinceName || '').localeCompare(String(b.provinceName || '')));
}

function normalizedSeasonDay(dayWib) {
  const date = parseDay(dayWib);
  if (!date) return null;
  const normalized = new Date(Date.UTC(2000, date.getUTCMonth(), date.getUTCDate()));
  return Math.floor((normalized.getTime() - Date.UTC(2000, 0, 1)) / DAY_MS) + 1;
}

function quantile(values, probability) {
  const sorted = values.slice().sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function seasonalBaseline(dailyFeatures, targetDayWib, options = {}) {
  const target = parseDay(targetDayWib);
  const region = boundedText(options.provinceName, 100);
  if (!target || !region) return { ready: false, reason: 'TARGET_OR_REGION_INVALID' };
  const rawCoverageRatio = finiteNumber(options.coverageRatio) ? options.coverageRatio : null;
  const coverageRatio = rawCoverageRatio !== null && rawCoverageRatio >= 0 && rawCoverageRatio <= 1
    ? rawCoverageRatio : null;
  const rawMinimumCoverage = finiteNumber(options.minimumCoverage) ? options.minimumCoverage : 0.9;
  const minimumCoverage = rawMinimumCoverage >= 0 && rawMinimumCoverage <= 1 ? rawMinimumCoverage : 0.9;
  const minimumYears = Number.isInteger(options.minimumYears) && options.minimumYears >= 3
    ? options.minimumYears : 3;
  const minimumSamples = Number.isInteger(options.minimumSamples) && options.minimumSamples > 0
    ? options.minimumSamples : 20;
  const radiusDays = Number.isInteger(options.radiusDays) && options.radiusDays >= 0
    ? Math.min(45, options.radiusDays) : 14;
  const targetYear = target.getUTCFullYear();
  const targetSeasonDay = normalizedSeasonDay(targetDayWib);
  const candidates = [];

  for (const row of Array.isArray(dailyFeatures) ? dailyFeatures : []) {
    if (!row) continue;
    const rowRegion = row.provinceName ?? row.province_name ?? row.region_name;
    const hotspotCount = row.hotspotCount ?? row.hotspot_count;
    const dayWib = row.dayWib ?? row.day_wib;
    const quality = row.qualityStatus ?? row.quality_status;
    if (quality && quality !== 'observed') continue;
    if (rowRegion !== region || !finiteNumber(hotspotCount) || hotspotCount < 0) continue;
    const date = parseDay(dayWib);
    const seasonDay = normalizedSeasonDay(dayWib);
    if (!date || date.getUTCFullYear() >= targetYear || seasonDay === null) continue;
    const direct = Math.abs(seasonDay - targetSeasonDay);
    const distance = Math.min(direct, 366 - direct);
    if (distance <= radiusDays) candidates.push({ year: date.getUTCFullYear(), value: hotspotCount });
  }

  const years = new Set(candidates.map(sample => sample.year));
  const blockers = [];
  if (coverageRatio === null || coverageRatio < minimumCoverage) blockers.push('SOURCE_COVERAGE_INSUFFICIENT');
  if (years.size < minimumYears) blockers.push('INSUFFICIENT_SEASONAL_YEARS');
  if (candidates.length < minimumSamples) blockers.push('INSUFFICIENT_SEASONAL_SAMPLES');
  if (blockers.length) {
    return {
      ready: false,
      reason: blockers[0],
      blockers,
      observedYears: years.size,
      observedSamples: candidates.length,
      requiredYears: minimumYears,
      requiredSamples: minimumSamples,
      coverageRatio,
      requiredCoverageRatio: minimumCoverage
    };
  }

  const values = candidates.map(sample => sample.value);
  return {
    ready: true,
    modelName: 'same-seasonal-window-median-v1',
    method: 'median of prior years within a same-calendar window',
    provinceName: region,
    targetDayWib,
    metric: 'observed_firms_hotspot_count',
    estimate: Number(quantile(values, 0.5).toFixed(2)),
    lowerHistoricalQuantile: Number(quantile(values, 0.1).toFixed(2)),
    upperHistoricalQuantile: Number(quantile(values, 0.9).toFixed(2)),
    sampleCount: candidates.length,
    yearCount: years.size,
    coverageRatio,
    limitations: 'Baseline only, not a trained ML model, calibrated probability, or official warning. Historical quantiles are not prediction intervals.'
  };
}

module.exports = {
  FIRMS_SOURCE_URL,
  MAX_HOTSPOTS_PER_CAPTURE,
  buildFireCapture,
  localDayWib,
  calendarFeatures,
  dailyFireFeatures,
  seasonalBaseline
};
