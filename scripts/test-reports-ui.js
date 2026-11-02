#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const model = require('../public/report-model.js');
const root = path.join(__dirname, '..');
const archiveRoot = path.join(root, 'public', 'reports', 'archive');
const index = JSON.parse(fs.readFileSync(path.join(archiveRoot, 'index.json'), 'utf8'));

function makeNode() {
  return {
    innerHTML: '',
    textContent: '',
    disabled: false,
    attributes: {},
    listeners: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] || null; },
    focus() {}
  };
}

function makeButton(period) {
  const node = makeNode();
  node.attributes['data-period'] = period;
  return node;
}

async function run() {
  assert(index.reports.length > 0, 'daily archive fixture should exist');
  assert(Array.isArray(index.weeklyReports) && index.weeklyReports.length > 0, 'persistent weekly archive fixture should exist');
  const nodes = {
    reportContent: makeNode(),
    archiveStatus: makeNode(),
    reportSelect: makeNode(),
    reportPrint: makeNode()
  };
  let selectHtml = '';
  Object.defineProperty(nodes.reportSelect, 'innerHTML', {
    get() { return selectHtml; },
    set(value) {
      selectHtml = String(value);
      const match = /<option value="([^"]*)"/.exec(selectHtml);
      if (match) this.value = match[1];
    }
  });
  const label = makeNode();
  const tabs = [makeButton('daily'), makeButton('weekly')];
  const document = {
    getElementById(id) { return nodes[id] || null; },
    querySelector(selector) { return selector === '.report-select-label' ? label : null; },
    querySelectorAll(selector) { return selector === '.report-period-tab' ? tabs : []; }
  };
  let language = 'id';
  const windowListeners = {};
  let printCount = 0;
  const window = {
    SiagaI18n: { getLanguage() { return language; } },
    SiagaReportModel: model,
    addEventListener(name, callback) { windowListeners[name] = callback; },
    print() { printCount++; }
  };
  const fetchedPaths = [];
  const fetch = async input => {
    const url = new URL(input, 'https://siaga.test');
    const pathname = url.pathname;
    fetchedPaths.push(pathname + url.search);
    let value;
    if (pathname === '/reports/archive/index.json') value = index;
    else {
      const relative = pathname.replace('/reports/archive/', '');
      const file = path.join(archiveRoot, relative);
      value = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(value)) };
  };
  const source = fs.readFileSync(path.join(root, 'public', 'reports.js'), 'utf8');
  vm.runInNewContext(source, { window, document, fetch, URL, console, setTimeout, clearTimeout });
  await new Promise(resolve => setTimeout(resolve, 25));
  assert(nodes.reportContent.innerHTML.includes('Catatan Situasi Bencana Indonesia'));
  assert(nodes.reportContent.innerHTML.includes('<svg class="report-chart-svg"'));
  assert(nodes.reportContent.innerHTML.includes('Perkiraan deteksi hotspot menurut kotak provinsi'));
  assert(nodes.reportContent.innerHTML.includes('kotak lintang-bujur kasar SIAGA-ID'));
  assert.strictEqual(nodes.reportPrint.disabled, false);
  assert(fetchedPaths.some(pathname => /^\/reports\/archive\/\d{4}-\d{2}-\d{2}\.json\?v=/.test(pathname)));

  tabs[1].listeners.click();
  await new Promise(resolve => setTimeout(resolve, 25));
  const weekly = index.weeklyReports[index.weeklyReports.length - 1];
  assert(fetchedPaths.includes('/reports/archive/' + weekly.file + '?v=' + encodeURIComponent(weekly.capturedAt)));
  assert(nodes.reportContent.innerHTML.includes('Tinjauan Mingguan Peristiwa dan Sumber'));
  assert(nodes.reportContent.innerHTML.includes(weekly.weekId));
  assert(nodes.reportContent.innerHTML.includes('1/7'));
  assert(nodes.reportContent.innerHTML.includes('Deteksi hotspot per snapshot tersimpan'));
  assert(nodes.reportContent.innerHTML.includes('jendela bergulir dapat bertumpang-tindih'));
  assert.strictEqual(nodes.reportPrint.disabled, false);

  language = 'en';
  windowListeners['siaga:languagechange']();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert(nodes.reportContent.innerHTML.includes('Weekly Review of Events and Sources'));
  assert(nodes.reportContent.innerHTML.includes('Abstract'));
  nodes.reportPrint.listeners.click();
  assert.strictEqual(printCount, 1);

  const malformedIndex = JSON.parse(JSON.stringify(index));
  const noDataEntry = {
    weekId: '2026-W45', file: 'weekly/2026-W45.json', throughDate: '2026-11-05',
    capturedAt: '2026-11-05T07:30:00.000Z', quality: 'partial', dailySnapshotCount: 1,
    expectedDailySnapshots: 7, eventCount: 0, referenceCount: 0
  };
  const malformedEntry = {
    weekId: '2026-W46', file: 'weekly/2026-W46.json', throughDate: '2026-11-12',
    capturedAt: '2026-11-12T07:30:00.000Z', quality: 'partial', dailySnapshotCount: 1,
    expectedDailySnapshots: 7, eventCount: 0, referenceCount: 0
  };
  const noDataPeriod = { start: '2026-11-04T07:30:00.000Z', end: noDataEntry.capturedAt, durationHours: 24 };
  const noDataIssue = {
    schemaVersion: 1, type: 'weekly', timeZone: 'Asia/Jakarta', weekId: noDataEntry.weekId,
    throughDate: noDataEntry.throughDate, capturedAt: noDataEntry.capturedAt, period: noDataPeriod,
    dailySnapshotCount: 1, expectedDailySnapshots: 7, complete: false, temporalComplete: false,
    sourceCoverageComplete: false, dailyIssuesComplete: false, completeDailySnapshots: 0,
    snapshots: [{ reportDate: noDataEntry.throughDate, period: noDataPeriod, coverage: { availableSources: 0, expectedSources: 5 }, quality: 'partial' }],
    sourceCoverage: Object.fromEntries(['fires', 'earthquakes', 'tsunami', 'eruptions', 'news'].map(key => [key, {
      availableSnapshots: 0, fullyCoveredSnapshots: 0, partialSnapshots: 0, staleSnapshots: 0,
      reportedSnapshots: 1, expectedSnapshots: 1, complete: false, subfeedCoverageBySnapshot: [], referenceId: null, referenceUrl: null
    }])),
    events: [], contexts: [], references: [],
    hotspotSeries: [{ reportDate: noDataEntry.throughDate, capturedAt: noDataEntry.capturedAt, period: noDataPeriod, reportedTotal: null, highConfidence: null, totalFrpMw: null, referenceId: null, referenceUrl: null }],
    coverageBoundaries: [], invalidSnapshotWindows: [], coverageGaps: [], coverageOverlaps: [], newsTruncated: false
  };
  malformedIndex.weeklyReports.push(noDataEntry, malformedEntry);
  const badNodes = {
    reportContent: makeNode(), archiveStatus: makeNode(), reportSelect: makeNode(), reportPrint: makeNode()
  };
  let badSelectHtml = '';
  Object.defineProperty(badNodes.reportSelect, 'innerHTML', {
    get() { return badSelectHtml; },
    set(value) {
      badSelectHtml = String(value);
      const match = /<option value="([^"]*)"/.exec(badSelectHtml);
      if (match) this.value = match[1];
    }
  });
  const badLabel = makeNode();
  const badTabs = [makeButton('daily'), makeButton('weekly')];
  const badDocument = {
    getElementById(id) { return badNodes[id] || null; },
    querySelector(selector) { return selector === '.report-select-label' ? badLabel : null; },
    querySelectorAll(selector) { return selector === '.report-period-tab' ? badTabs : []; }
  };
  const badWindow = {
    SiagaI18n: { getLanguage() { return 'id'; } },
    SiagaReportModel: model,
    addEventListener() {}, print() {}
  };
  const badFetch = async input => {
    const url = new URL(input, 'https://siaga.test');
    let value;
    if (url.pathname === '/reports/archive/index.json') value = malformedIndex;
    else if (url.pathname === '/reports/archive/weekly/2026-W45.json') value = noDataIssue;
    else if (url.pathname === '/reports/archive/weekly/2026-W46.json') {
      value = { schemaVersion: 1, type: 'weekly', weekId: '2026-W46', throughDate: malformedEntry.throughDate, capturedAt: malformedEntry.capturedAt };
    } else {
      const relative = url.pathname.replace('/reports/archive/', '');
      value = JSON.parse(fs.readFileSync(path.join(archiveRoot, relative), 'utf8'));
    }
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(value)) };
  };
  vm.runInNewContext(source, { window: badWindow, document: badDocument, fetch: badFetch, URL, console, setTimeout, clearTimeout });
  await new Promise(resolve => setTimeout(resolve, 25));
  badTabs[1].listeners.click();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert(badNodes.reportContent.innerHTML.includes('Berkas arsip mingguan tidak dapat dibaca'));
  assert(badNodes.archiveStatus.textContent.includes('Gagal memuat arsip mingguan'));
  badNodes.reportSelect.value = noDataEntry.weekId;
  badNodes.reportSelect.listeners.change();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert(badNodes.reportContent.innerHTML.includes('N/A'));
  assert(!badNodes.reportContent.innerHTML.includes('N/A: 0'));

  console.log('  ✓ Report page loads daily and persisted weekly archives with cache-busting versions');
  console.log('  ✓ Daily and weekly pages render cited inline SVG charts from archived data');
  console.log('  ✓ Weekly selection uses the saved ISO-week issue, not an in-browser live rebuild');
  console.log('  ✓ Language switching rerenders the archived issue and PDF action invokes print');
  console.log('  ✓ Malformed archives are rejected and missing chart values stay N/A, not zero');
  console.log('\nReports UI checks: 6 passed.');
}

run().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
