'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const history = require('../lib/ai-history');
const store = require('../lib/ai-history-store');

let passed = 0;
function check(name, condition) {
  assert.equal(!!condition, true, name);
  passed++;
  console.log('  LULUS ' + name);
}

const nowMs = Date.parse('2026-11-02T07:00:00.000Z');
const sourceState = {
  hasData: true,
  healthy: true,
  lastOkAgeMs: 60000,
  lastSuccessfulAt: '2026-11-02T06:59:00.000Z',
  everyMs: 600000
};
const fireSnapshot = {
  mode: 'live',
  source: 'NASA FIRMS test feed',
  windowHours: 24,
  oldestAcq: '2026-11-01T07:00:00.000Z',
  newestAcq: '2026-11-02T06:00:00.000Z',
  hotspots: [
    { lat: -0.53, lon: 101.44, frp: 25.45, confidence: 90, acq: '2026-11-02T06:00:00.000Z', satellite: 'Suomi-NPP', daynight: 'd' },
    { lat: -0.53, lon: 101.44, frp: 25.45, confidence: 90, acq: '2026-11-02T06:00:00.000Z', satellite: 'Suomi-NPP', daynight: 'd' },
    { lat: -1.03, lon: 101.75, frp: 0, confidence: 65, acq: '2026-11-01T07:30:00.000Z', satellite: 'NOAA-20', daynight: 'n' },
    { lat: 200, lon: 101, frp: 10, confidence: 80, acq: '2026-11-02T06:00:00.000Z', satellite: 'bad', daynight: 'D' }
  ]
};

async function main() {
  console.log('\n== Compact historical ingest ==');
  const capture = history.buildFireCapture(fireSnapshot, sourceState, {
    nowMs,
    provinceOf: () => 'Riau'
  });
  const provinceRollup = capture.rollups.find(row => row.region_level === 'province');
  const countryRollup = capture.rollups.find(row => row.region_level === 'country');
  check('healthy live source creates compact regional rollups and marks malformed input partial',
    capture.eligible && capture.status === 'partial'
      && capture.run.input_count === 4 && capture.run.valid_count === 2
      && capture.run.rejected_count === 1 && capture.run.duplicate_count === 1
      && capture.rollups.length === 2);
  check('one WIB capture day contains a national row and one row per mapped province',
    capture.run.capture_day_wib === '2026-11-02'
      && countryRollup.region_key === 'ID' && countryRollup.hotspot_count === 2
      && provinceRollup.region_key === 'ID:riau' && provinceRollup.region_name === 'Riau'
      && provinceRollup.hotspot_count === 2);
  check('aggregate preserves high-confidence count, FRP total, satellites, and zero-valued FRP event',
    provinceRollup.high_confidence_count === 1 && provinceRollup.frp_total_mw === 25.45
      && provinceRollup.mean_confidence === 77.5 && provinceRollup.satellite_count === 2
      && provinceRollup.hotspot_count === 2);
  check('database rows contain no per-hotspot event key or coordinates',
    capture.rollups.every(row => !Object.hasOwn(row, 'event_key')
      && !Object.hasOwn(row, 'lat') && !Object.hasOwn(row, 'lon')
      && !Object.hasOwn(row, 'latitude_cell') && !Object.hasOwn(row, 'longitude_cell')));
  const repeated = history.buildFireCapture(fireSnapshot, sourceState, { nowMs, provinceOf: () => 'Riau' });
  check('stable aggregate content hashes remain the same across identical rolling snapshots',
    capture.run.content_hash === repeated.run.content_hash
      && provinceRollup.content_hash === repeated.rollups.find(row => row.region_level === 'province').content_hash);
  check('rollup payload is bounded by regions, not input hotspot count',
    capture.rollups.length <= 40 && capture.rollups.length < fireSnapshot.hotspots.length + 1);
  check('stale or unhealthy source data is skipped before persistence',
    history.buildFireCapture(fireSnapshot, { ...sourceState, healthy: false }, { nowMs }).reason === 'SOURCE_UNAVAILABLE'
      && history.buildFireCapture(fireSnapshot, { ...sourceState, lastOkAgeMs: 25 * 60 * 1000 }, { nowMs }).reason === 'SOURCE_STALE');
  check('non-live and unknown-window payloads are not ingested',
    history.buildFireCapture({ ...fireSnapshot, mode: 'snapshot' }, sourceState, { nowMs }).reason === 'SOURCE_NOT_LIVE'
      && history.buildFireCapture({ ...fireSnapshot, windowHours: null }, sourceState, { nowMs }).reason === 'SOURCE_WINDOW_UNKNOWN');
  const emptyCapture = history.buildFireCapture({ ...fireSnapshot, hotspots: [] }, sourceState, { nowMs });
  check('an empty source feed is logged without manufacturing zero-valued regional rows',
    emptyCapture.status === 'empty' && emptyCapture.rollups.length === 0
      && emptyCapture.run.coverage_status === 'empty_feed_not_zero');
  const invalidOnly = history.buildFireCapture({
    ...fireSnapshot,
    hotspots: [{ lat: 95, lon: 200, frp: -1, confidence: 120, acq: 'bad' }]
  }, sourceState, { nowMs });
  check('a malformed non-empty feed is skipped instead of replacing good daily rollups',
    !invalidOnly.eligible && invalidOnly.reason === 'NO_VALID_OBSERVATIONS');

  console.log('\n== WIB calendar features and seasonal gate ==');
  const localDay = history.localDayWib('2026-01-01T18:00:00.000Z');
  check('calendar date conversion uses WIB instead of UTC', localDay === '2026-01-02');
  const features = history.dailyFireFeatures([
    { acquired_at: '2026-01-01T18:00:00.000Z', province_name: 'Riau', frp_mw: 12, confidence: 90, satellite: 'A' },
    { acquired_at: '2026-01-01T19:00:00.000Z', province_name: 'Riau', frp_mw: 0, confidence: 65, satellite: 'A' },
    { acquired_at: '2026-01-01T18:00:00.000Z', province_name: 'Jambi', frp_mw: 8, confidence: 85, satellite: 'B' }
  ]);
  check('feature helper groups by WIB day and region without filling absent days with zero',
    features.length === 2 && features[0].dayWib === '2026-01-02'
      && features[0].provinceName === 'Jambi' && features[0].hotspotCount === 1
      && features[1].provinceName === 'Riau' && features[1].hotspotCount === 2
      && features[1].highConfidenceCount === 1 && features[1].totalFrpMw === 12);
  const calendar = history.calendarFeatures('2026-01-02');
  check('calendar features avoid assuming one national wet season',
    calendar.calendar_month === 1 && Number.isFinite(calendar.annual_sin)
      && Number.isFinite(calendar.annual_cos) && !Object.hasOwn(calendar, 'season'));

  const daily = [];
  for (const year of [2019, 2020, 2021]) {
    for (let day = 7; day <= 23; day++) {
      daily.push({
        provinceName: 'Riau',
        dayWib: `${year}-03-${String(day).padStart(2, '0')}`,
        hotspotCount: (year - 2018) * 10 + (day % 5),
        qualityStatus: 'observed'
      });
    }
  }
  const notReady = history.seasonalBaseline(daily, '2022-03-15', {
    provinceName: 'Riau', coverageRatio: 0.6
  });
  check('seasonal baseline refuses low or invalid coverage ratios',
    !notReady.ready && notReady.blockers.includes('SOURCE_COVERAGE_INSUFFICIENT')
      && !history.seasonalBaseline(daily, '2022-03-15', {
        provinceName: 'Riau', coverageRatio: 1.5
      }).ready);
  const ready = history.seasonalBaseline(daily, '2022-03-15', {
    provinceName: 'Riau', coverageRatio: 0.95
  });
  check('baseline requires prior years and returns historical quantiles, not calibrated uncertainty',
    ready.ready && ready.yearCount === 3 && ready.sampleCount >= 20
      && ready.modelName === 'same-seasonal-window-median-v1'
      && ready.limitations.includes('not a trained ML model')
      && Number.isFinite(ready.estimate));
  const sqlViewReady = history.seasonalBaseline(daily.map(row => ({
    region_name: row.provinceName,
    day_wib: row.dayWib,
    hotspot_count: row.hotspotCount,
    quality_status: row.qualityStatus
  })), '2022-03-15', { provinceName: 'Riau', coverageRatio: 0.95 });
  check('baseline accepts SQL view rows and excludes partial snapshots', sqlViewReady.ready);
  check('baseline excludes future dates and partial-quality rows',
    !history.seasonalBaseline(daily, '2019-03-15', {
      provinceName: 'Riau', coverageRatio: 1
    }).ready
      && !history.seasonalBaseline(daily.map(row => ({ ...row, qualityStatus: 'partial' })), '2022-03-15', {
        provinceName: 'Riau', coverageRatio: 0.95
      }).ready);

  console.log('\n== Tiny Neon write path ==');
  const disabled = await store.persistFireCapture({ capture });
  check('missing DATABASE_URL disables persistence without loading the driver',
    !disabled.enabled && disabled.reason === 'DATABASE_URL_NOT_CONFIGURED');
  const skipped = await store.persistFireCapture({
    databaseUrl: 'postgres://fake.test/no-secret',
    capture: invalidOnly,
    sqlClient: { query: async () => { throw new Error('should not run'); } }
  });
  check('stale or malformed snapshots do not issue a database query',
    skipped.enabled && skipped.ok && skipped.status === 'skipped' && !skipped.persisted);

  let capturedQuery = '';
  let capturedParams = [];
  const fakeSql = {
    query: async (query, params, options) => {
      capturedQuery = query;
      capturedParams = params;
      assert.ok(options.fetchOptions.signal instanceof AbortSignal);
      return [{ persisted: true, rollups_upserted: 2, rollups_deleted: 0 }];
    }
  };
  const saved = await store.persistFireCapture({
    databaseUrl: 'postgres://fake.test/not-a-secret',
    capture,
    sqlClient: fakeSql,
    runId: '00000000-0000-4000-8000-000000000001'
  });
  check('one parameterized SQL query upserts only the compact regional rollups',
    saved.enabled && saved.ok && saved.persisted && saved.rollupsUpserted === 2
      && JSON.parse(capturedParams[20]).length === 2
      && capturedQuery.includes('jsonb_to_recordset($21::jsonb)')
      && capturedQuery.includes("INTERVAL '6 hours'")
      && capturedQuery.includes('current_region.region_key = old_rollup.region_key'));
  check('database statement has no raw event table and no point coordinates',
    !capturedQuery.includes('fire_detections') && !capturedQuery.includes('latitude_cell')
      && !capturedQuery.includes('longitude_cell'));
  check('database failure output never includes connection strings or raw provider messages',
    store.safeFailureCode(new Error('postgres://secret@host/db raw response')) === 'AI_HISTORY_WRITE_FAILED'
      && store.safeFailureCode(Object.assign(new Error('timeout'), { name: 'AbortError' })) === 'AI_HISTORY_TIMEOUT');

  console.log('\n== Runtime wiring and schema ==');
  const root = path.join(__dirname, '..');
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const browserSource = ['public/app.js', 'public/index.html', 'public/i18n.js']
    .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const migration = fs.readFileSync(path.join(root, 'db/migrations/001-ai-history.sql'), 'utf8');
  const docs = fs.readFileSync(path.join(root, 'docs/AI_HISTORY.md'), 'utf8');
  check('DATABASE_URL is server-only and never referenced by browser code',
    serverSource.includes('process.env.DATABASE_URL') && !/DATABASE_URL/.test(browserSource));
  check('authenticated cron reads the refreshed scheduler cache for history',
    serverSource.includes("app.get('/api/cron', autentikasiCron")
      && serverSource.includes('aiHistoryStore.captureFireHistory')
      && serverSource.includes("snapshot: scheduler.peek('hotspots')"));
  check('migration stores regional rollups and leaves raw fire events out of PostgreSQL',
    migration.includes('CREATE TABLE IF NOT EXISTS ai_analytics.fire_daily_rollups')
      && migration.includes('PRIMARY KEY (capture_day_wib, region_key)')
      && !migration.includes('CREATE TABLE IF NOT EXISTS ai_analytics.fire_detections'));
  check('view marks the WIB snapshot date and does not fill missing days with zero',
    migration.includes('capture_day_wib AS day_wib')
      && migration.includes('missing rows are not zero'));
  check('documentation quantifies the row cap and says snapshots are not calendar-day totals',
    docs.includes('sekitar 40 rollup per hari')
      && docs.includes('bukan total pasti untuk satu hari kalender'));

  console.log(`\nPASS: ${passed} AI history checks`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
