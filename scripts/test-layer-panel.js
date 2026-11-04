'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/dashboard-clean.css'), 'utf8');
const pkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');

console.log('\n== panel lapisan ringkas ==');
['bencana', 'api-asap', 'udara', 'angin', 'lainnya'].forEach(group => {
  assert.ok(html.includes(`data-layer-group="${group}"`), `grup ${group} ada`);
});
assert.ok(html.includes('<details class="layer-group" data-layer-group="api-asap" open>'));
['bencana', 'udara', 'angin', 'lainnya'].forEach(group => {
  assert.ok(!new RegExp(`data-layer-group="${group}" open`).test(html), `grup ${group} default tertutup`);
});
[
  'lyVolcano', 'lyAsh', 'lyQuake', 'lyShelter', 'lyFire', 'lyPm25', 'lyAod', 'lyDust', 'lySmoke',
  'lyRegionalHaze', 'lyAerosol', 'lyImpact', 'lyAir', 'lyWind', 'lyConc', 'lyFlights'
].forEach(id => {
  assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} unik`);
});
assert.ok((html.match(/class="ui-info-btn"/g) || []).length >= 13);
assert.ok(html.includes('id="tip-smoke-mode"'));
assert.ok(html.includes('PM2.5 adalah total model, bukan konsentrasi asap spesifik.'));
assert.ok(html.includes('Angin 10 m tidak mewakili ketinggian asap.'));
assert.ok(html.includes('jaringan ADS-B publik'));
assert.ok(!html.includes('smoke-mode-note'));
assert.ok(!html.includes('windParticlesNote'));
assert.ok(html.includes('smoke-mode-options segmented'));
assert.ok(css.includes('.layer-group'));
assert.ok(css.includes('.smoke-mode-options.segmented'));
assert.ok(/test-layer-panel\.js/.test(pkg));
console.log('  LULUS accordion, default Api & Asap, ikon info, tooltip kritis, segmented mode');
console.log('\n1/1 uji panel lapisan lulus.');
