#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const model = require('../public/report-model.js');
const root = path.join(__dirname, '..');
let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (error) { console.error('  ✗ ' + name + '\n    ' + (error && error.stack || error)); process.exitCode = 1; }
}

const capture = '2026-10-30T00:15:00.000Z';
const inside = '2026-10-29T16:00:00.000Z';
const fixture = {
  overview: {
    meta: { updatedAt: capture, windowHours: 24, oldestAcq: '2026-10-29T01:00:00.000Z', newestAcq: inside },
    stats: { hotspots: 12, highConfidence: 5, totalFrp: 20, impactCountInterpretation: 'Indicative geometry only.' },
    hotspotsMeta: { truncated: true },
    hotspots: [{ lat: -1, lon: 110, frp: 3 }],
    provinceRanking: [
      { province: 'Papua Selatan', hotspots: 7, frp: 10 },
      { province: 'Sulawesi Tengah', hotspots: 3, frp: 5 }
    ],
    provinceRankingMeta: {
      assignmentMethod: 'coarse rectangular province boxes', assignedDetectionCount: 10,
      unassignedDetectionCount: 2, availableProvinceCount: 2, returnedProvinceCount: 2,
      maxReturned: 15, truncated: false
    },
    regionalHaze: { meta: {
      asmc: { reportAt: '2026-10-22T09:48:00.000Z', reportDate: '2026-10-22', productUrl: 'https://wis2.asmc.asean.org/regional-haze-situation/', summary: 'Regional report.', summaryId: 'Laporan regional.' }
    } }
  },
  hazard: {
    updatedAt: capture,
    quakes: {
      sourceUrl: 'https://www.bmkg.go.id/gempabumi', windowHours: 24,
      quakes: [
        { time: inside, magnitude: 5.4, depthKm: 10, area: 'Laut Jawa', lat: -5, lon: 110, tsunami: false, potensi: 'Tidak berpotensi tsunami' },
        { time: '2026-10-28T23:00:00.000Z', magnitude: 4.2, depthKm: 8, area: 'Di luar jendela', lat: -5, lon: 110 }
      ]
    },
    tsunami: { sourceUrl: 'https://www.tsunami.gov/', bulletins: [
      { time: '2026-10-29T20:00:00.000Z', title: 'No tsunami threat', summary: 'Source bulletin text.', url: 'https://www.tsunami.gov/events/PHEB/2026/10/29/123' }
    ] }
  },
  eruptions: {
    updatedAt: capture, sourceUrl: 'https://magma.esdm.go.id/v1/gunung-api/letusan', windowHours: 24,
    reports: [{ key: 'merapi', name: 'Merapi', at: '2026-10-29T17:00:00.000Z', heightM: 500, bearingLabel: 'barat daya', durationS: 70, text: 'Laporan pos pengamatan dalam bahasa sumber.' }]
  },
  news: {
    ok: true, source: 'Google News', fetchedAt: capture,
    articles: [
      { title: 'Judul berita berbahasa Indonesia', url: 'https://example.org/berita-1', domain: 'example.org', pubDate: 'Thu, 29 Oct 2026 12:00:00 GMT' },
      { title: 'Original headline in English', url: 'https://example.net/story-2', domain: 'example.net', seendate: '20261029T150000Z' },
      { title: 'Old article', url: 'https://example.com/old', pubDate: '2026-10-28T12:00:00Z' },
      { title: 'Invalid URL', url: 'javascript:alert(1)', pubDate: '2026-10-28T12:00:00.000Z' }
    ]
  }
};
const snapshot = model.buildDailySnapshot(fixture, capture, {});

check('Jakarta-local issue date accounts for UTC+7', () => {
  assert.strictEqual(snapshot.reportDate, '2026-10-30');
  assert.strictEqual(snapshot.timeZone, 'Asia/Jakarta');
});
check('ISO week identifiers use the Jakarta-local report date', () => {
  assert.strictEqual(model.isoWeekId('2026-10-29T07:00:00.000Z'), '2026-W44');
  assert.strictEqual(model.isoWeekId('2027-01-01T00:00:00.000Z'), '2026-W53');
});
check('daily report records an exact trailing 24-hour window', () => {
  assert.strictEqual(Date.parse(snapshot.period.end) - Date.parse(snapshot.period.start), 24 * 60 * 60 * 1000);
  assert.strictEqual(snapshot.capturedAt, new Date(capture).toISOString());
});
check('only timestamped events inside the capture window are included', () => {
  assert.strictEqual(snapshot.events.length, 5);
  assert(!snapshot.events.some(event => /Di luar jendela/.test(event.title)));
  assert(!snapshot.events.some(event => /Old article/.test(event.title)));
});
check('source headlines and quoted report wording remain verbatim', () => {
  assert(snapshot.events.some(event => event.title === 'Judul berita berbahasa Indonesia'));
  assert(snapshot.events.some(event => event.title === 'Original headline in English'));
  assert(snapshot.events.some(event => event.description === 'Laporan pos pengamatan dalam bahasa sumber.'));
});
check('invalid in-period news citations are excluded and make the issue partial', () => {
  const data = JSON.parse(JSON.stringify(fixture));
  data.news.articles.push({ title: 'Unsafe source URL', url: 'javascript:alert(1)', pubDate: inside });
  const result = model.buildDailySnapshot(data, capture, {});
  assert.strictEqual(result.sourceStatus.news.available, true);
  assert.strictEqual(result.sourceStatus.news.periodRecords, 3);
  assert.strictEqual(result.sourceStatus.news.rejectedRecords, 1);
  assert.strictEqual(result.sourceStatus.news.includedRecords, 2);
  assert.strictEqual(result.sourceStatus.news.partial, true);
  assert.strictEqual(result.notes.newsRejectedRecords, 1);
  assert.strictEqual(result.quality, 'partial');
});
check('unsafe URLs are rejected and each event has a verifiable HTTP(S) citation', () => {
  assert(!snapshot.references.some(ref => ref.url.startsWith('javascript:')));
  const refIds = new Set(snapshot.references.map(ref => ref.id));
  snapshot.events.forEach(event => {
    assert(refIds.has(event.referenceId));
    assert(/^https?:\/\//.test(event.referenceUrl));
  });
});
check('hotspot counts and truncation are preserved without implying exposure', () => {
  assert.strictEqual(snapshot.observations.hotspots.reportedTotal, 12);
  assert.strictEqual(snapshot.observations.hotspots.truncated, true);
  assert(/not fire perimeters|Indicative/i.test(snapshot.observations.hotspots.interpretation));
});
check('daily archive preserves approximate province ranking and unassigned-detection metadata', () => {
  const observation = snapshot.observations.hotspots;
  assert.strictEqual(observation.provinceRanking.length, 2);
  assert.strictEqual(observation.provinceRanking[0].province, 'Papua Selatan');
  assert.strictEqual(observation.provinceRankingMeta.assignmentMethod, 'coarse rectangular province boxes');
  assert.strictEqual(observation.provinceRankingMeta.assignedDetectionCount, 10);
  assert.strictEqual(observation.provinceRankingMeta.unassignedDetectionCount, 2);
});
check('older haze reports are carried as dated context, not new period events', () => {
  assert.strictEqual(snapshot.contexts.length, 1);
  assert.strictEqual(snapshot.contexts[0].carryForward, true);
  assert.strictEqual(snapshot.contexts[0].inReportPeriod, false);
  assert(snapshot.references.some(ref => ref.publisher === 'ASMC'));
});
check('all available source feeds are marked complete for the fixture', () => {
  assert.strictEqual(snapshot.quality, 'complete');
  assert.strictEqual(snapshot.coverage.availableSources, 5);
});
check('available feeds have source references and actual retrieval/record coverage metadata', () => {
  const references = new Map(snapshot.references.map(ref => [ref.id, ref.url]));
  ['fires', 'earthquakes', 'tsunami', 'eruptions', 'news'].forEach(key => {
    assert(snapshot.sourceStatus[key].available);
    assert(references.has(snapshot.sourceStatus[key].referenceId));
    assert.strictEqual(references.get(snapshot.sourceStatus[key].referenceId), snapshot.sourceStatus[key].referenceUrl);
  });
  assert.strictEqual(snapshot.sourceStatus.earthquakes.periodRecords, 1);
  assert.strictEqual(snapshot.sourceStatus.news.includedRecords, 2);
  assert.strictEqual(snapshot.sourceStatus.fires.coverageStart, '2026-10-29T01:00:00.000Z');
});
check('news list caps are disclosed and make a truncated daily issue partial', () => {
  const cappedInput = Object.assign({}, fixture, { news: Object.assign({}, fixture.news, { articles: Array.from({ length: 101 }, (_, i) => ({ title: 'Headline ' + i, url: 'https://news.example/' + i, pubDate: inside })) }) });
  const capped = model.buildDailySnapshot(cappedInput, capture, {});
  assert.strictEqual(capped.sourceStatus.news.periodRecords, 101);
  assert.strictEqual(capped.sourceStatus.news.includedRecords, 40);
  assert.strictEqual(capped.sourceStatus.news.truncated, true);
  assert.strictEqual(capped.notes.newsTruncated, true);
  assert.strictEqual(capped.quality, 'partial');
});
check('missing feeds remain unavailable rather than being represented as zero', () => {
  const partial = model.buildDailySnapshot({ hazard: null, overview: null, eruptions: null, news: null }, capture, { overview: 'HTTP 502' });
  assert.strictEqual(partial.quality, 'unavailable');
  assert.strictEqual(partial.sourceStatus.fires.available, false);
  assert.strictEqual(partial.sourceStatus.fires.reportedTotal, null);
  assert.strictEqual(partial.sourceStatus.earthquakes.periodRecords, null);
  assert.strictEqual(partial.sourceStatus.earthquakes.includedRecords, null);
  assert.strictEqual(partial.observations.hotspots, null);
  assert.strictEqual(partial.events.length, 0);
});
check('GDELT compact timestamps parse as UTC instants and reject impossible dates', () => {
  assert.strictEqual(model.parseInstant('20261029T150000Z').toISOString(), '2026-10-29T15:00:00.000Z');
  assert.strictEqual(model.parseInstant('20260230T120000Z'), null);
});
check('null, blank, and boolean measurements never become numeric zero', () => {
  const partial = model.buildDailySnapshot({ overview: { meta: {}, stats: { hotspots: null }, provinceRanking: [{ province: 'Unknown', hotspots: null, frp: null }] } }, capture, {});
  assert.strictEqual(partial.sourceStatus.fires.available, false);
  assert.strictEqual(partial.observations.hotspots, null);
  assert.strictEqual(model.parseInstant(false), null);
  const typed = model.buildDailySnapshot({ overview: { meta: {}, stats: { hotspots: [] } } }, capture, {});
  assert.strictEqual(typed.sourceStatus.fires.reportedTotal, null);
  assert.strictEqual(typed.sourceStatus.fires.available, false);
});
check('a successful empty source feed is recorded as a real zero', () => {
  const data = JSON.parse(JSON.stringify(fixture));
  data.hazard.quakes = {
    source: 'BMKG', sourceUrl: 'https://www.bmkg.go.id/gempabumi', windowHours: 24,
    quakes: [], feedCoverage: { expectedFeeds: 3, availableFeeds: 3, failures: [] }
  };
  const result = model.buildDailySnapshot(data, capture, {});
  assert.strictEqual(result.sourceStatus.earthquakes.available, true);
  assert.strictEqual(result.sourceStatus.earthquakes.recordCount, 0);
  assert.strictEqual(result.sourceStatus.earthquakes.periodRecords, 0);
  assert.strictEqual(result.quality, 'complete');
});
check('failed BMKG upstream feeds remain unavailable, not zero', () => {
  const data = JSON.parse(JSON.stringify(fixture));
  data.hazard.quakes = {
    source: 'BMKG', sourceUrl: 'https://www.bmkg.go.id/gempabumi', windowHours: 24,
    quakes: [], feedCoverage: { expectedFeeds: 3, availableFeeds: 0, failures: [{ feed: 'autogempa.json', error: 'bmkg_503' }] }
  };
  const result = model.buildDailySnapshot(data, capture, {});
  assert.strictEqual(result.sourceStatus.earthquakes.available, false);
  assert.strictEqual(result.sourceStatus.earthquakes.recordCount, null);
  assert.strictEqual(result.sourceStatus.earthquakes.periodRecords, null);
  assert.strictEqual(result.sourceStatus.earthquakes.partial, true);
  assert.strictEqual(result.quality, 'partial');
});
check('partial BMKG subfeeds and a stale scheduler cache are disclosed', () => {
  const data = JSON.parse(JSON.stringify(fixture));
  data.hazard.quakes.feedCoverage = { expectedFeeds: 3, availableFeeds: 2, failures: [{ feed: 'gempadirasakan.json', error: 'bmkg_503' }] };
  data.hazard.sourceState = { quakes: { hasData: true, healthy: false, lastOkAgeMs: 7200000, everyMs: 60000, lastSuccessfulAt: '2026-10-29T02:00:00.000Z', lastCheckedAt: capture, errorNote: 'bmkg_all_feeds_unavailable' } };
  const result = model.buildDailySnapshot(data, capture, {});
  assert.strictEqual(result.sourceStatus.earthquakes.available, true);
  assert.strictEqual(result.sourceStatus.earthquakes.partial, true);
  assert.strictEqual(result.sourceStatus.earthquakes.stale, true);
  assert.strictEqual(result.sourceStatus.earthquakes.lastOkAgeHours, 2);
  assert.strictEqual(result.sourceStatus.earthquakes.subfeedCoverage.availableFeeds, 2);
  assert.strictEqual(result.quality, 'partial');
});
check('failed scheduler tasks with no cached values are not zero record sets', () => {
  const data = JSON.parse(JSON.stringify(fixture));
  data.overview.meta.sourceState = { hasData: false, healthy: false, lastOkAgeMs: null, everyMs: 60000, errorNote: 'NASA FIRMS unavailable' };
  data.overview.stats.hotspots = 0;
  data.hazard.quakes = { quakes: [], sourceUrl: 'https://www.bmkg.go.id/gempabumi' };
  data.hazard.sourceState = { quakes: { hasData: false, healthy: false, lastOkAgeMs: null, everyMs: 60000, lastError: 'no data' } };
  const result = model.buildDailySnapshot(data, capture, {});
  assert.strictEqual(result.sourceStatus.earthquakes.available, false);
  assert.strictEqual(result.sourceStatus.earthquakes.recordCount, null);
  assert.strictEqual(result.sourceStatus.earthquakes.periodRecords, null);
  assert.strictEqual(result.sourceStatus.fires.available, false);
  assert.strictEqual(result.sourceStatus.fires.reportedTotal, null);
});
check('missing province counts stay missing and earthquake nulls do not become M0 or zero depth', () => {
  const data = {
    overview: { meta: {}, stats: { hotspots: 1 }, provinceRanking: [{ province: 'Unknown', hotspots: null, frp: null }] },
    hazard: { updatedAt: capture, quakes: { sourceUrl: 'https://www.bmkg.go.id/gempabumi', quakes: [{ time: inside, magnitude: null, depthKm: null, area: 'Unknown magnitude' }] } }
  };
  const result = model.buildDailySnapshot(data, capture, {});
  assert.strictEqual(result.observations.hotspots.provinceRanking[0].hotspots, null);
  assert.strictEqual(result.observations.hotspots.provinceRanking[0].frpMw, null);
  const quake = result.events.find(event => event.type === 'earthquake');
  assert.strictEqual(quake.title, 'Unknown magnitude');
  assert.strictEqual(quake.facts.magnitude, null);
  assert.strictEqual(quake.facts.depthKm, null);
});

const priorInput = {
  hazard: {
    updatedAt: '2026-10-29T00:15:00.000Z',
    quakes: { sourceUrl: 'https://www.bmkg.go.id/gempabumi', windowHours: 24, quakes: [
      { time: '2026-10-28T15:00:00.000Z', magnitude: 4.8, depthKm: 12, area: 'Laut Flores', lat: -7, lon: 123, tsunami: false }
    ] },
    tsunami: { sourceUrl: 'https://www.tsunami.gov/', bulletins: [] }
  },
  eruptions: { updatedAt: '2026-10-29T00:15:00.000Z', sourceUrl: 'https://magma.esdm.go.id/', reports: [], windowHours: 24 },
  news: { ok: true, source: 'Google News', fetchedAt: '2026-10-29T00:15:00.000Z', articles: [] }
};
const priorSnapshot = model.buildDailySnapshot(priorInput, '2026-10-29T00:15:00.000Z', {});
const weekly = model.buildWeeklyIssue([snapshot, priorSnapshot], 7);
check('weekly issue derives from saved snapshots and exposes missing-day coverage', () => {
  assert.strictEqual(weekly.dailySnapshotCount, 2);
  assert.strictEqual(weekly.expectedDailySnapshots, 7);
  assert.strictEqual(weekly.complete, false);
  assert.strictEqual(weekly.continuousCoverage, true);
  assert.strictEqual(weekly.sourceCoverage.fires.availableSnapshots, 1);
});
check('weekly merge remaps per-snapshot citations to the correct source URL', () => {
  const quakeEvents = weekly.events.filter(event => event.type === 'earthquake');
  assert.strictEqual(quakeEvents.length, 2);
  const refs = new Map(weekly.references.map(ref => [ref.id, ref.url]));
  quakeEvents.forEach(event => assert.strictEqual(refs.get(event.referenceId), 'https://www.bmkg.go.id/gempabumi'));
  assert.strictEqual(refs.get(weekly.sourceCoverage.fires.referenceId), 'https://firms.modaps.eosdis.nasa.gov/');
});
check('weekly hotspot observations remain a series and are not summed', () => {
  assert.strictEqual(weekly.hotspotSeries.length, 2);
  const rankedSnapshot = weekly.hotspotSeries.find(item => item.provinceRanking.length > 0);
  assert(rankedSnapshot);
  assert.strictEqual(rankedSnapshot.provinceRanking[0].province, 'Papua Selatan');
  assert.strictEqual(rankedSnapshot.provinceRankingMeta.assignmentMethod, 'coarse rectangular province boxes');
  assert(!Object.prototype.hasOwnProperty.call(weekly, 'hotspotTotal'));
});
check('weekly archive deduplicates repeated source event identifiers', () => {
  const repeated = JSON.parse(JSON.stringify(priorSnapshot));
  repeated.reportDate = '2026-10-29';
  repeated.period = { start: '2026-10-28T16:00:00.000Z', end: '2026-10-29T16:00:00.000Z', durationHours: 24 };
  repeated.events.push(Object.assign({}, snapshot.events.find(event => event.type === 'earthquake')));
  repeated.references.push(...snapshot.references);
  const merged = model.buildWeeklyIssue([priorSnapshot, repeated], 7);
  const quakeIds = merged.events.filter(event => event.type === 'earthquake').map(event => event.id);
  assert.strictEqual(new Set(quakeIds).size, quakeIds.length);
});
check('weekly archive discloses overlap and never adds overlapping hotspot windows', () => {
  const first = JSON.parse(JSON.stringify(snapshot));
  const second = JSON.parse(JSON.stringify(snapshot));
  first.period = { start: '2026-10-27T00:00:00.000Z', end: '2026-10-28T00:00:00.000Z', durationHours: 24 };
  second.period = { start: '2026-10-27T23:00:00.000Z', end: '2026-10-28T23:00:00.000Z', durationHours: 24 };
  first.reportDate = '2026-10-28';
  second.reportDate = '2026-10-29';
  const issue = model.buildWeeklyIssue([first, second], 2);
  assert.strictEqual(issue.coverageOverlaps.length, 1);
  assert.strictEqual(issue.coverageOverlaps[0].offsetMinutes, -60);
  assert.strictEqual(issue.continuousCoverage, true);
  assert.strictEqual(issue.temporalComplete, false);
  assert.strictEqual(issue.complete, false);
  assert.strictEqual(issue.hotspotSeries.length, 2);
  assert(!Object.prototype.hasOwnProperty.call(issue, 'hotspotTotal'));
});
check('weekly archive marks temporal gaps and incomplete source coverage as partial', () => {
  const first = JSON.parse(JSON.stringify(snapshot));
  const second = JSON.parse(JSON.stringify(snapshot));
  first.period = { start: '2026-10-27T00:00:00.000Z', end: '2026-10-28T00:00:00.000Z', durationHours: 24 };
  second.period = { start: '2026-10-28T01:00:00.000Z', end: '2026-10-29T01:00:00.000Z', durationHours: 24 };
  first.reportDate = '2026-10-28';
  second.reportDate = '2026-10-29';
  delete second.sourceStatus.news;
  const issue = model.buildWeeklyIssue([first, second], 2);
  assert.strictEqual(issue.coverageGaps.length, 1);
  assert.strictEqual(issue.continuousCoverage, false);
  assert.strictEqual(issue.sourceCoverage.news.reportedSnapshots, 1);
  assert.strictEqual(issue.complete, false);
});
check('weekly source coverage reports partial upstream feeds separately from availability', () => {
  const first = JSON.parse(JSON.stringify(snapshot));
  const second = JSON.parse(JSON.stringify(snapshot));
  first.period = { start: '2026-10-27T00:00:00.000Z', end: '2026-10-28T00:00:00.000Z', durationHours: 24 };
  second.period = { start: '2026-10-28T00:00:00.000Z', end: '2026-10-29T00:00:00.000Z', durationHours: 24 };
  first.reportDate = '2026-10-28';
  second.reportDate = '2026-10-29';
  first.sourceStatus.earthquakes.partial = true;
  first.sourceStatus.earthquakes.subfeedCoverage = { expectedFeeds: 3, availableFeeds: 2, complete: false, failures: [] };
  const issue = model.buildWeeklyIssue([first, second], 2);
  assert.strictEqual(issue.sourceCoverage.earthquakes.availableSnapshots, 2);
  assert.strictEqual(issue.sourceCoverage.earthquakes.partialSnapshots, 1);
  assert.strictEqual(issue.sourceCoverage.earthquakes.fullyCoveredSnapshots, 1);
  assert.strictEqual(issue.sourceCoverage.earthquakes.subfeedCoverageBySnapshot.length, 1);
  assert.strictEqual(issue.sourceCoverage.earthquakes.subfeedCoverageBySnapshot[0].reportDate, '2026-10-28');
  assert.strictEqual(issue.sourceCoverage.earthquakes.complete, false);
  assert.strictEqual(issue.complete, false);
});
check('weekly archive rejects non-24-hour daily windows as complete coverage', () => {
  const first = JSON.parse(JSON.stringify(snapshot));
  const second = JSON.parse(JSON.stringify(snapshot));
  first.period = { start: '2026-10-27T00:00:00.000Z', end: '2026-10-27T23:00:00.000Z', durationHours: 23 };
  second.period = { start: '2026-10-27T23:00:00.000Z', end: '2026-10-28T23:00:00.000Z', durationHours: 24 };
  first.reportDate = '2026-10-27';
  second.reportDate = '2026-10-28';
  const issue = model.buildWeeklyIssue([first, second], 2);
  assert.strictEqual(issue.continuousCoverage, true);
  assert.strictEqual(issue.invalidSnapshotWindows.length, 1);
  assert.strictEqual(issue.temporalComplete, false);
  assert.strictEqual(issue.complete, false);
});
check('weekly news cap keeps references aligned with included headlines and marks the issue partial', () => {
  const days = [];
  const baseEnd = Date.parse(capture);
  for (let day = 0; day < 4; day++) {
    const news = Object.assign({}, fixture.news, { articles: Array.from({ length: 40 }, (_, i) => ({
      title: 'Headline ' + day + '-' + i,
      url: 'https://news.example/' + day + '-' + i,
      domain: 'news.example',
      pubDate: inside
    })) });
    const item = model.buildDailySnapshot(Object.assign({}, fixture, { news }), capture, {});
    const end = baseEnd + day * 24 * 60 * 60 * 1000;
    item.period = { start: new Date(end - 24 * 60 * 60 * 1000).toISOString(), end: new Date(end).toISOString(), durationHours: 24 };
    item.reportDate = model.localDate(end);
    item.events = item.events.filter(event => event.type === 'news');
    days.push(item);
  }
  const issue = model.buildWeeklyIssue(days, 4);
  assert.strictEqual(issue.newsRecordCountBeforeCap, 160);
  assert.strictEqual(issue.newsRecordCountIncluded, 120);
  assert.strictEqual(issue.newsTruncated, true);
  assert.strictEqual(issue.complete, false);
  const newsRefs = issue.references.filter(ref => ref.sourceType === 'secondary media report');
  assert.strictEqual(newsRefs.length, 120);
  const refUrls = new Map(issue.references.map(ref => [ref.id, ref.url]));
  issue.events.forEach(event => assert.strictEqual(refUrls.get(event.referenceId), event.referenceUrl));
});
check('weekly completeness inherits partial quality from archived daily issues', () => {
  const first = JSON.parse(JSON.stringify(snapshot));
  const second = JSON.parse(JSON.stringify(snapshot));
  first.quality = 'partial';
  first.period = { start: '2026-10-27T00:00:00.000Z', end: '2026-10-28T00:00:00.000Z', durationHours: 24 };
  second.period = { start: '2026-10-28T00:00:00.000Z', end: '2026-10-29T00:00:00.000Z', durationHours: 24 };
  first.reportDate = '2026-10-28';
  second.reportDate = '2026-10-29';
  const issue = model.buildWeeklyIssue([first, second], 2);
  assert.strictEqual(issue.sourceCoverageComplete, true);
  assert.strictEqual(issue.dailyIssuesComplete, false);
  assert.strictEqual(issue.complete, false);
});
check('a complete seven-day archive requires all seven snapshots, no gaps, and all feeds', () => {
  const days = [];
  const lastEnd = Date.parse(snapshot.period.end);
  for (let i = 0; i < 7; i++) {
    const item = JSON.parse(JSON.stringify(snapshot));
    const end = lastEnd - (6 - i) * 24 * 60 * 60 * 1000;
    item.period = { start: new Date(end - 24 * 60 * 60 * 1000).toISOString(), end: new Date(end).toISOString(), durationHours: 24 };
    item.reportDate = model.localDate(end);
    item.capturedAt = new Date(end).toISOString();
    item.events = [];
    days.push(item);
  }
  const issue = model.buildWeeklyIssue(days, 7);
  assert.strictEqual(issue.temporalComplete, true);
  assert.strictEqual(issue.sourceCoverageComplete, true);
  assert.strictEqual(issue.complete, true);
});

const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const homeHtml = fs.readFileSync(path.join(root, 'public', 'home.html'), 'utf8');
const reportsHtml = fs.readFileSync(path.join(root, 'public', 'reports.html'), 'utf8');
const operationsHtml = fs.readFileSync(path.join(root, 'public', 'operations.html'), 'utf8');
const incidentHtml = fs.readFileSync(path.join(root, 'public', 'insiden.html'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'archive-daily-reports.yml'), 'utf8');
const archiveIndex = JSON.parse(fs.readFileSync(path.join(root, 'public', 'reports', 'archive', 'index.json'), 'utf8'));

check('overview exposes method and truncation metadata for approximate province charts', () => {
  assert(server.includes("assignmentMethod: 'coarse rectangular province boxes'"));
  assert(server.includes('assignedDetectionCount: assignedProvinceDetections'));
  assert(server.includes('unassignedDetectionCount: Math.max(0, hotspots.length - assignedProvinceDetections)'));
  assert(server.includes('provinceRankingMeta, worstAir'));
});
check('three top-level routes are explicit and the existing dashboard has its own route', () => {
  assert(server.includes("app.get('/', (_req, res) => sendPublicPage(res, 'home.html'))"));
  assert(server.includes("app.get('/dashboard', (_req, res) => sendIndex(res))"));
  assert(server.includes("app.get('/reports', (_req, res) => sendPublicPage(res, 'reports.html'))"));
  assert(server.includes("'/dashboard', '/reports'"));
});
check('all three pages share navigation and the global ID/EN switch', () => {
  [indexHtml, homeHtml, reportsHtml].forEach(html => {
    assert(html.includes('href="/"'));
    assert(html.includes('href="/dashboard"'));
    assert(html.includes('href="/reports"'));
    assert(html.includes('id="langId"'));
    assert(html.includes('id="langEn"'));
  });
});
check('operational pages link back to the dashboard after the root becomes Home', () => {
  assert(operationsHtml.includes('href="/dashboard"'));
  assert(incidentHtml.includes('href="/dashboard"'));
});
check('PDF export is print-based and the report page has a print stylesheet', () => {
  assert(reportsHtml.includes('id="reportPrint"'));
  assert(fs.readFileSync(path.join(root, 'public', 'reports.js'), 'utf8').includes('window.print()'));
  assert(fs.readFileSync(path.join(root, 'public', 'site.css'), 'utf8').includes('@media print'));
});
check('daily archive workflow runs after the Vercel refresh and stores dated JSON', () => {
  assert(workflow.includes("cron: '30 19 * * *'"));
  assert(workflow.includes('19:00 UTC (02:00 WIB)'));
  assert(workflow.includes('19:30 UTC'));
  assert(workflow.includes('(02:30 WIB)'));
  assert(workflow.includes('contents: write'));
  assert(workflow.includes('node scripts/archive-daily-report.js'));
  assert(workflow.includes('git push origin HEAD:main'));
  assert.strictEqual(archiveIndex.schemaVersion, 1);
  assert(Array.isArray(archiveIndex.reports));
  archiveIndex.reports.forEach(entry => {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(entry.date));
    assert.strictEqual(entry.file, entry.date + '.json');
    const archived = JSON.parse(fs.readFileSync(path.join(root, 'public', 'reports', 'archive', entry.file), 'utf8'));
    assert.strictEqual(archived.reportDate, entry.date);
    assert.strictEqual(archived.capturedAt, entry.capturedAt);
    assert.strictEqual(archived.quality, entry.quality);
  });
});
check('weekly issues are persisted by ISO week and rebuilt only from same-week daily archives', () => {
  assert(Array.isArray(archiveIndex.weeklyReports));
  assert(archiveIndex.weeklyReports.length > 0);
  archiveIndex.weeklyReports.forEach(entry => {
    assert(/^\d{4}-W\d{2}$/.test(entry.weekId));
    assert.strictEqual(entry.file, 'weekly/' + entry.weekId + '.json');
    const archived = JSON.parse(fs.readFileSync(path.join(root, 'public', 'reports', 'archive', entry.file), 'utf8'));
    assert.strictEqual(archived.type, 'weekly');
    assert.strictEqual(archived.weekId, entry.weekId);
    assert.strictEqual(archived.throughDate, entry.throughDate);
    assert.strictEqual(archived.capturedAt, entry.capturedAt);
    assert.strictEqual(archived.quality, entry.quality);
    assert(archived.snapshots.every(daily => !Object.prototype.hasOwnProperty.call(daily, 'events')));
    const daily = archiveIndex.reports.filter(item => model.isoWeekId(item.date) === entry.weekId)
      .map(item => JSON.parse(fs.readFileSync(path.join(root, 'public', 'reports', 'archive', item.file), 'utf8')));
    const rebuilt = model.buildWeeklyIssue(daily, model.WEEK_DAYS);
    assert.strictEqual(archived.dailySnapshotCount, rebuilt.dailySnapshotCount);
    assert.deepStrictEqual(archived.events.map(event => event.id), rebuilt.events.map(event => event.id));
    assert.deepStrictEqual(archived.snapshots.map(item => item.reportDate), rebuilt.snapshots.map(item => item.reportDate));
  });
  const reports = fs.readFileSync(path.join(root, 'public', 'reports.js'), 'utf8');
  assert(reports.includes('getWeeklyIssue(entry)'));
  assert(reports.includes("'/reports/archive/weekly/'"));
});

console.log('\nReport/pages checks: ' + passed + ' passed.');
