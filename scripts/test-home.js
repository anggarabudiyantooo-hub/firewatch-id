#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeNode() {
  return {
    innerHTML: '',
    textContent: '',
    disabled: false,
    listeners: {},
    addEventListener(name, callback) { this.listeners[name] = callback; },
    querySelector(selector) { return selector === 'strong' ? this.strong : this.small; },
    classList: { add() {}, remove() {} }
  };
}

async function mount(language, payloads) {
  const stats = Array.from({ length: 3 }, () => {
    const card = makeNode();
    card.strong = { textContent: '' };
    card.small = { textContent: '' };
    return card;
  });
  const nodes = {
    homeEvents: makeNode(),
    homeEventsStatus: makeNode(),
    homeUpdated: makeNode(),
    homeRefresh: makeNode()
  };
  const document = {
    getElementById(id) { return nodes[id] || null; },
    querySelectorAll(selector) { return selector === '.home-stat' ? stats : []; }
  };
  const listeners = {};
  const window = {
    location: { origin: 'https://siaga.test' },
    SiagaI18n: { getLanguage() { return language; } },
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  const fetch = async input => {
    const route = new URL(input, window.location.origin).pathname;
    const result = payloads[route];
    if (!result || result.status && result.status >= 400) {
      return { ok: false, status: result && result.status || 503 };
    }
    return { ok: true, status: 200, json: async () => result.body };
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'home.js'), 'utf8');
  vm.runInNewContext(source, { window, document, fetch, AbortController, setTimeout, clearTimeout, URL });
  await new Promise(resolve => setImmediate(resolve));
  return { nodes, stats, listeners, setLanguage(value) { language = value; } };
}

const payloads = {
  '/api/overview': { body: { meta: { updatedAt: '2026-10-29T20:55:00.000Z', windowHours: 24 }, stats: { hotspots: 0 } } },
  '/api/hazard': { body: {
    quakes: { sourceUrl: 'https://www.bmkg.go.id/gempabumi', windowHours: 24, quakes: [
      { time: '2026-10-29T20:40:00.000Z', magnitude: 4.2, depthKm: 10, area: 'Laut Jawa' }
    ] },
    tsunami: { sourceUrl: 'https://www.tsunami.gov/', bulletins: [
      { time: '2026-10-29T20:50:00.000Z', title: 'PTWC bulletin title', summary: 'Original bulletin text.', url: 'https://www.tsunami.gov/events/1' }
    ] }
  } },
  '/api/eruptions': { body: { sourceUrl: 'https://magma.esdm.go.id/', windowHours: 24, reports: [
    { at: '2026-10-29T20:20:00.000Z', name: 'Merapi report', heightM: 300 }
  ] } },
  '/api/news': { body: { fetchedAt: '2026-10-29T20:57:00.000Z', articles: [
    { title: '<script>alert(1)</script>', url: 'https://news.example/story', domain: 'News desk', pubDate: 'Thu, 29 Oct 2026 20:45:00 GMT' },
    { title: 'Unsafe link is discarded', url: 'javascript:alert(1)', pubDate: '2026-10-29T20:48:00Z' }
  ] } }
};

(async () => {
  const homeMarkup = fs.readFileSync(path.join(__dirname, '..', 'public', 'home.html'), 'utf8');
  const dashboardMarkup = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert(!homeMarkup.includes('href="/operations"') && !dashboardMarkup.includes('href="/operations"')
    && !dashboardMarkup.includes('dock-ops'),
  'Operations must not be linked from public pages');
  console.log('  ✓ Operations has no public shortcut from Home or Dashboard');

  const page = await mount('id', payloads);
  const html = page.nodes.homeEvents.innerHTML;
  const expectedOrder = ['PTWC bulletin title', '&lt;script&gt;alert(1)&lt;/script&gt;', 'Laut Jawa', 'Merapi report'];
  const positions = expectedOrder.map(text => html.indexOf(text));
  assert(positions.every(position => position >= 0), 'all verified source items should render');
  assert.deepStrictEqual(positions.slice().sort((a, b) => a - b), positions, 'items should be newest first across sources');
  assert(!html.includes('<script>alert(1)</script>'), 'source headlines must be HTML-escaped');
  assert(!html.includes('Unsafe link is discarded'), 'unsafe source URLs must be rejected');
  assert(html.includes('href="https://www.tsunami.gov/events/1"'), 'tsunami item should retain its direct citation');
  assert(html.includes('target="_blank" rel="noopener noreferrer"'), 'external citations should open safely');
  assert.strictEqual(page.stats[0].strong.textContent, '0', 'a verified zero count remains zero');
  page.setLanguage('en');
  page.listeners['siaga:languagechange']();
  assert(page.nodes.homeEvents.innerHTML.includes('Tsunami bulletin · NOAA PTWC'), 'event labels should rerender in English');
  assert(page.nodes.homeEvents.innerHTML.includes('Open source'), 'source action should rerender in English');
  console.log('  ✓ Home combines current source records and sorts events by source time');
  console.log('  ✓ Home preserves source links, escapes headlines, and rejects unsafe URLs');
  console.log('  ✓ Home retains true zero measurements and rerenders labels in English');

  const missing = Object.assign({}, payloads, { '/api/hazard': { status: 503 } });
  const partialPage = await mount('en', missing);
  assert.strictEqual(partialPage.stats[1].strong.textContent, 'Unavailable');
  assert(/unavailable/i.test(partialPage.stats[1].small.textContent));
  console.log('  ✓ A failed hazard feed is unavailable, not reported as zero');
  console.log('\nHome checks: 5 passed.');
})().catch(error => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
