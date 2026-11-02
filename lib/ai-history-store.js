'use strict';

const crypto = require('node:crypto');
const { buildFireCapture } = require('./ai-history');

const DEFAULT_TIMEOUT_MS = 12000;

const UPSERT_CAPTURE_SQL = `
WITH changed_run AS (
  INSERT INTO ai_analytics.ingestion_runs (
    run_id, source_key, capture_day_wib, status, started_at, completed_at,
    source_captured_at, source_age_ms, source_healthy, source_mode,
    source_window_hours, oldest_event_at, newest_event_at, input_count,
    valid_count, duplicate_count, rejected_count, rollup_count,
    coverage_status, content_hash, details
  ) VALUES (
    $1::uuid, $2::text, $3::date, $4::text, $5::timestamptz, $6::timestamptz,
    $7::timestamptz, $8::bigint, $9::boolean, $10::text, $11::smallint,
    $12::timestamptz, $13::timestamptz, $14::integer, $15::integer,
    $16::integer, $17::integer, $18::smallint, $19::text, $20::char(64), $22::jsonb
  )
  ON CONFLICT (source_key, capture_day_wib) DO UPDATE SET
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at,
    source_captured_at = EXCLUDED.source_captured_at,
    source_age_ms = EXCLUDED.source_age_ms,
    source_healthy = EXCLUDED.source_healthy,
    source_mode = EXCLUDED.source_mode,
    source_window_hours = EXCLUDED.source_window_hours,
    oldest_event_at = EXCLUDED.oldest_event_at,
    newest_event_at = EXCLUDED.newest_event_at,
    input_count = EXCLUDED.input_count,
    valid_count = EXCLUDED.valid_count,
    duplicate_count = EXCLUDED.duplicate_count,
    rejected_count = EXCLUDED.rejected_count,
    rollup_count = EXCLUDED.rollup_count,
    coverage_status = EXCLUDED.coverage_status,
    content_hash = EXCLUDED.content_hash,
    details = EXCLUDED.details
  WHERE ai_analytics.ingestion_runs.content_hash <> EXCLUDED.content_hash
     OR EXCLUDED.source_captured_at >= ai_analytics.ingestion_runs.source_captured_at + INTERVAL '6 hours'
  RETURNING run_id
),
rollup_input AS (
  SELECT *
  FROM jsonb_to_recordset($21::jsonb) AS input_row (
    region_key text,
    region_level text,
    region_name text,
    region_assignment_method text,
    hotspot_count integer,
    high_confidence_count integer,
    frp_total_mw numeric,
    mean_confidence numeric,
    satellite_count smallint,
    unassigned_count integer,
    oldest_event_at timestamptz,
    newest_event_at timestamptz,
    quality_status text,
    content_hash char(64)
  )
),
upserted AS (
  INSERT INTO ai_analytics.fire_daily_rollups (
    capture_day_wib, region_key, region_level, region_name,
    region_assignment_method, captured_at, source_age_ms, source_window_hours,
    hotspot_count, high_confidence_count, frp_total_mw, mean_confidence,
    satellite_count, unassigned_count, oldest_event_at, newest_event_at,
    quality_status, content_hash, ingestion_run_id
  )
  SELECT
    $3::date, input_row.region_key, input_row.region_level, input_row.region_name,
    input_row.region_assignment_method, $7::timestamptz, $8::bigint, $11::smallint,
    input_row.hotspot_count, input_row.high_confidence_count, input_row.frp_total_mw,
    input_row.mean_confidence, input_row.satellite_count, input_row.unassigned_count,
    input_row.oldest_event_at, input_row.newest_event_at, input_row.quality_status,
    input_row.content_hash, changed_run.run_id
  FROM rollup_input AS input_row
  CROSS JOIN changed_run
  ON CONFLICT (capture_day_wib, region_key) DO UPDATE SET
    region_level = EXCLUDED.region_level,
    region_name = EXCLUDED.region_name,
    region_assignment_method = EXCLUDED.region_assignment_method,
    captured_at = EXCLUDED.captured_at,
    source_age_ms = EXCLUDED.source_age_ms,
    source_window_hours = EXCLUDED.source_window_hours,
    hotspot_count = EXCLUDED.hotspot_count,
    high_confidence_count = EXCLUDED.high_confidence_count,
    frp_total_mw = EXCLUDED.frp_total_mw,
    mean_confidence = EXCLUDED.mean_confidence,
    satellite_count = EXCLUDED.satellite_count,
    unassigned_count = EXCLUDED.unassigned_count,
    oldest_event_at = EXCLUDED.oldest_event_at,
    newest_event_at = EXCLUDED.newest_event_at,
    quality_status = EXCLUDED.quality_status,
    content_hash = EXCLUDED.content_hash,
    ingestion_run_id = EXCLUDED.ingestion_run_id
  WHERE ai_analytics.fire_daily_rollups.content_hash <> EXCLUDED.content_hash
     OR EXCLUDED.captured_at >= ai_analytics.fire_daily_rollups.captured_at + INTERVAL '6 hours'
  RETURNING region_key
),
deleted AS (
  DELETE FROM ai_analytics.fire_daily_rollups AS old_rollup
  USING changed_run
  WHERE old_rollup.capture_day_wib = $3::date
    AND NOT EXISTS (
      SELECT 1
      FROM rollup_input AS current_region
      WHERE current_region.region_key = old_rollup.region_key
    )
  RETURNING old_rollup.region_key
)
SELECT
  EXISTS (SELECT 1 FROM changed_run) AS persisted,
  (SELECT run_id::text FROM changed_run LIMIT 1) AS persisted_run_id,
  (SELECT count(*)::integer FROM upserted) AS rollups_upserted,
  (SELECT count(*)::integer FROM deleted) AS rollups_deleted;
`;

async function makeNeonClient(databaseUrl) {
  const driver = await import('@neondatabase/serverless');
  return driver.neon(databaseUrl);
}

function safeFailureCode(error) {
  if (error && error.name === 'AbortError') return 'AI_HISTORY_TIMEOUT';
  const code = error && typeof error.code === 'string' ? error.code : '';
  return /^[A-Z0-9_]{2,32}$/.test(code) ? 'AI_HISTORY_' + code : 'AI_HISTORY_WRITE_FAILED';
}

function captureParams(runId, run, rollups) {
  return [
    runId,
    run.source_key,
    run.capture_day_wib,
    run.status,
    run.started_at,
    run.completed_at,
    run.source_captured_at,
    run.source_age_ms,
    run.source_healthy,
    run.source_mode,
    run.source_window_hours,
    run.oldest_event_at,
    run.newest_event_at,
    run.input_count,
    run.valid_count,
    run.duplicate_count,
    run.rejected_count,
    run.rollup_count,
    run.coverage_status,
    run.content_hash,
    JSON.stringify(rollups),
    JSON.stringify(run.details || {})
  ];
}

async function persistFireCapture(options = {}) {
  const databaseUrl = String(options.databaseUrl || '').trim();
  if (!databaseUrl) {
    return { enabled: false, ok: false, reason: 'DATABASE_URL_NOT_CONFIGURED' };
  }
  const capture = options.capture;
  if (!capture || !capture.run || !Array.isArray(capture.rollups)) {
    return { enabled: true, ok: false, failureCode: 'AI_HISTORY_CAPTURE_INVALID' };
  }
  if (!capture.eligible) {
    return {
      enabled: true,
      ok: true,
      status: 'skipped',
      reason: capture.reason || 'SOURCE_NOT_ELIGIBLE',
      persisted: false,
      rollups: 0
    };
  }
  if (capture.status === 'partial' && capture.rollups.length === 0) {
    return { enabled: true, ok: true, status: 'skipped', reason: 'NO_VALID_ROLLUPS', persisted: false, rollups: 0 };
  }

  let sql;
  try {
    sql = options.sqlClient || await makeNeonClient(databaseUrl);
  } catch (error) {
    return { enabled: true, ok: false, failureCode: safeFailureCode(error) };
  }
  if (!sql || typeof sql.query !== 'function') {
    return { enabled: true, ok: false, failureCode: 'AI_HISTORY_DRIVER_INVALID' };
  }

  const runId = options.runId || crypto.randomUUID();
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(1000, Math.min(25000, options.timeoutMs)) : DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resultRows = await sql.query(UPSERT_CAPTURE_SQL, captureParams(runId, capture.run, capture.rollups), {
      fetchOptions: { signal: controller.signal }
    });
    const result = Array.isArray(resultRows) ? resultRows[0] : null;
    return {
      enabled: true,
      ok: true,
      runId: result && result.persisted_run_id ? result.persisted_run_id : null,
      status: capture.status,
      persisted: !!(result && result.persisted),
      captureDayWib: capture.run.capture_day_wib,
      inputCount: capture.run.input_count,
      validCount: capture.run.valid_count,
      rollupCount: capture.rollups.length,
      rollupsUpserted: result && Number.isFinite(Number(result.rollups_upserted))
        ? Number(result.rollups_upserted) : 0,
      rollupsDeleted: result && Number.isFinite(Number(result.rollups_deleted))
        ? Number(result.rollups_deleted) : 0,
      rejected: capture.run.rejected_count,
      duplicate: capture.run.duplicate_count,
      coverageStatus: capture.run.coverage_status
    };
  } catch (error) {
    return { enabled: true, ok: false, runId, failureCode: safeFailureCode(error) };
  } finally {
    clearTimeout(timer);
  }
}

async function captureFireHistory(options = {}) {
  const databaseUrl = String(options.databaseUrl || '').trim();
  if (!databaseUrl) {
    return { enabled: false, ok: false, reason: 'DATABASE_URL_NOT_CONFIGURED' };
  }
  const capture = buildFireCapture(options.snapshot, options.sourceState, {
    provinceOf: options.provinceOf,
    nowMs: options.nowMs,
    maxSourceAgeMs: options.maxSourceAgeMs
  });
  return persistFireCapture({
    databaseUrl,
    capture,
    sqlClient: options.sqlClient,
    timeoutMs: options.timeoutMs,
    runId: options.runId
  });
}

module.exports = {
  UPSERT_CAPTURE_SQL,
  safeFailureCode,
  persistFireCapture,
  captureFireHistory
};
