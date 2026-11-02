#!/usr/bin/env node
'use strict';

/**
 * Capture one source-linked, trailing-24-hour evidence snapshot for the public
 * daily/weekly report page. The scheduled GitHub workflow commits the JSON
 * archive; this script never invents an event or treats a failed feed as zero.
 */
const fs = require('fs');
const path = require('path');
const ReportModel = require('../public/report-model.js');

const ROOT = path.join(__dirname, '..');
const ARCHIVE_DIR = path.join(ROOT, 'public', 'reports', 'archive');
const INDEX_FILE = path.join(ARCHIVE_DIR, 'index.json');
const BASE_URL = String(process.env.REPORT_BASE_URL || process.env.BASE_URL || 'https://firewatch-id.vercel.app').replace(/\/+$/, '');
const ENDPOINTS = {
  overview: '/api/overview',
  hazard: '/api/hazard',
  eruptions: '/api/eruptions',
  news: '/api/news'
};
const TIMEOUT_MS = 90000;

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

async function fetchJson(endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(BASE_URL + endpoint, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid JSON payload');
    return { data: data, error: null };
  } catch (error) {
    const message = error && error.name === 'AbortError' ? 'request timeout' : String(error && error.message || 'request failed');
    return { data: null, error: message.slice(0, 180) };
  } finally {
    clearTimeout(timer);
  }
}

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) return { schemaVersion: 1, timeZone: ReportModel.TIME_ZONE, generatedAt: null, reports: [], weeklyReports: [] };
  const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.reports)) {
    throw new Error('Archive index has an unsupported or invalid schema');
  }
  if (!Array.isArray(parsed.weeklyReports)) parsed.weeklyReports = [];
  return parsed;
}

function writeJsonAtomic(file, value) {
  const temporary = file + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  if (!/^https?:\/\//i.test(BASE_URL)) throw new Error('REPORT_BASE_URL must be an HTTP(S) origin');
  const captureArg = argValue('--at') || process.env.REPORT_CAPTURE_AT || new Date().toISOString();
  const captureDate = ReportModel.parseInstant(captureArg);
  if (!captureDate) throw new Error('Capture timestamp is invalid');

  const names = Object.keys(ENDPOINTS);
  const results = await Promise.all(names.map(function (name) { return fetchJson(ENDPOINTS[name]); }));
  const input = {};
  const errors = {};
  var successful = 0;
  results.forEach(function (result, index) {
    const name = names[index];
    input[name] = result.data;
    if (result.data) successful++;
    if (result.error) errors[name] = result.error;
  });
  if (!successful) throw new Error('All source feeds failed; no archive was written');

  const snapshot = ReportModel.buildDailySnapshot(input, captureDate, errors);
  if (!snapshot || !snapshot.reportDate || snapshot.quality === 'unavailable') {
    throw new Error('Snapshot contains no usable source data; no archive was written');
  }

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  const fileName = snapshot.reportDate + '.json';
  const target = path.join(ARCHIVE_DIR, fileName);
  const index = readIndex();
  const existing = index.reports.find(function (entry) { return entry && entry.date === snapshot.reportDate; });
  if (existing && process.argv.indexOf('--replace') < 0) {
    console.log('Already archived for ' + snapshot.reportDate + '; keeping the existing issue unchanged.');
    return;
  }

  writeJsonAtomic(target, snapshot);
  const entry = {
    date: snapshot.reportDate,
    file: fileName,
    capturedAt: snapshot.capturedAt,
    period: snapshot.period,
    quality: snapshot.quality,
    eventCount: snapshot.events.length,
    availableSources: snapshot.coverage.availableSources,
    expectedSources: snapshot.coverage.expectedSources
  };
  index.reports = index.reports.filter(function (item) { return item && item.date !== snapshot.reportDate; });
  index.reports.push(entry);
  index.reports.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

  const weekId = ReportModel.isoWeekId(snapshot.reportDate);
  if (!weekId) throw new Error('Could not determine the ISO week for ' + snapshot.reportDate);
  const weekSnapshots = index.reports.filter(function (item) {
    return item && ReportModel.isoWeekId(item.date) === weekId;
  }).map(function (item) {
    if (item.date === snapshot.reportDate) return snapshot;
    const saved = JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, item.file), 'utf8'));
    if (!saved || saved.schemaVersion !== 1 || saved.reportDate !== item.date) {
      throw new Error('Invalid daily snapshot in weekly archive: ' + item.file);
    }
    return saved;
  });
  const weeklyIssue = ReportModel.buildWeeklyIssue(weekSnapshots, ReportModel.WEEK_DAYS);
  weeklyIssue.weekId = weekId;
  weeklyIssue.throughDate = snapshot.reportDate;
  weeklyIssue.capturedAt = snapshot.capturedAt;
  weeklyIssue.quality = weeklyIssue.complete ? 'complete' : 'partial';
  weeklyIssue.snapshots = weeklyIssue.snapshots.map(function (daily) {
    return {
      reportDate: daily.reportDate,
      period: daily.period,
      coverage: daily.coverage,
      quality: daily.quality
    };
  });

  const weeklyRelative = path.join('weekly', weekId + '.json');
  const weeklyTarget = path.join(ARCHIVE_DIR, weeklyRelative);
  fs.mkdirSync(path.dirname(weeklyTarget), { recursive: true });
  writeJsonAtomic(weeklyTarget, weeklyIssue);
  const weeklyEntry = {
    weekId: weekId,
    file: 'weekly/' + weekId + '.json',
    throughDate: snapshot.reportDate,
    capturedAt: snapshot.capturedAt,
    period: weeklyIssue.period,
    quality: weeklyIssue.quality,
    dailySnapshotCount: weeklyIssue.dailySnapshotCount,
    expectedDailySnapshots: weeklyIssue.expectedDailySnapshots,
    eventCount: weeklyIssue.events.length,
    referenceCount: weeklyIssue.references.length
  };
  index.weeklyReports = index.weeklyReports.filter(function (item) { return item && item.weekId !== weekId; });
  index.weeklyReports.push(weeklyEntry);
  index.weeklyReports.sort(function (a, b) { return String(a.weekId).localeCompare(String(b.weekId)); });
  index.generatedAt = new Date().toISOString();
  writeJsonAtomic(INDEX_FILE, index);

  console.log('Archived ' + snapshot.reportDate + ' (' + snapshot.quality + ')');
  console.log('  Capture window: ' + snapshot.period.start + ' through ' + snapshot.period.end);
  console.log('  Available feeds: ' + snapshot.coverage.availableSources + '/' + snapshot.coverage.expectedSources);
  console.log('  Source-linked records: ' + snapshot.events.length);
  console.log('  File: ' + path.relative(ROOT, target));
  console.log('  Weekly issue: ' + weekId + ' through ' + snapshot.reportDate + ' (' + weeklyIssue.quality + ', ' + weeklyIssue.dailySnapshotCount + '/' + weeklyIssue.expectedDailySnapshots + ' daily snapshots)');
  console.log('  Weekly file: ' + path.relative(ROOT, weeklyTarget));
}

if (require.main === module) {
  main().catch(function (error) {
    console.error('[archive-daily-report] ' + (error && error.message || error));
    process.exitCode = 1;
  });
}

module.exports = { main: main, fetchJson: fetchJson, readIndex: readIndex };
